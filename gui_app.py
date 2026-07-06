from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from itertools import count
from pathlib import Path
from typing import Callable

from PySide6.QtCore import (
    QAbstractListModel,
    QModelIndex,
    QObject,
    Property,
    QRunnable,
    QSettings,
    QThreadPool,
    Qt,
    Signal,
    Slot,
)
from PySide6.QtQml import QQmlApplicationEngine
from PySide6.QtWidgets import QApplication

from cd2_client import build_client
from clipboard_links import build_target_directory, extract_links, normalize_base_directory


DEFAULT_BASE_DIRECTORY = "/115open/javbus"


@dataclass
class LinkTask:
    id: int
    url: str
    kind: str
    display_name: str
    status: str = "pending"
    message: str = ""
    result_paths: list[str] = field(default_factory=list)

    @property
    def short_url(self) -> str:
        if len(self.url) <= 96:
            return self.url
        return f"{self.url[:72]}...{self.url[-18:]}"


class LinkListModel(QAbstractListModel):
    UrlRole = Qt.ItemDataRole.UserRole + 1
    KindRole = Qt.ItemDataRole.UserRole + 2
    DisplayNameRole = Qt.ItemDataRole.UserRole + 3
    StatusRole = Qt.ItemDataRole.UserRole + 4
    MessageRole = Qt.ItemDataRole.UserRole + 5
    ShortUrlRole = Qt.ItemDataRole.UserRole + 6

    countChanged = Signal()

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._tasks: list[LinkTask] = []

    @Property(int, notify=countChanged)
    def count(self) -> int:
        return len(self._tasks)

    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:
        if parent.isValid():
            return 0
        return len(self._tasks)

    def data(self, index: QModelIndex, role: int = Qt.ItemDataRole.DisplayRole):
        if not index.isValid() or index.row() < 0 or index.row() >= len(self._tasks):
            return None

        task = self._tasks[index.row()]
        if role == self.UrlRole:
            return task.url
        if role == self.KindRole:
            return task.kind
        if role == self.DisplayNameRole or role == Qt.ItemDataRole.DisplayRole:
            return task.display_name
        if role == self.StatusRole:
            return task.status
        if role == self.MessageRole:
            return task.message
        if role == self.ShortUrlRole:
            return task.short_url
        return None

    def roleNames(self) -> dict[int, bytes]:
        return {
            self.UrlRole: b"url",
            self.KindRole: b"kind",
            self.DisplayNameRole: b"displayName",
            self.StatusRole: b"status",
            self.MessageRole: b"message",
            self.ShortUrlRole: b"shortUrl",
        }

    def add_links(self, links) -> int:
        new_tasks: list[LinkTask] = []
        known_urls = {task.url for task in self._tasks}
        for link in links:
            if link.url in known_urls:
                continue
            known_urls.add(link.url)
            new_tasks.append(
                LinkTask(
                    id=next(_TASK_IDS),
                    url=link.url,
                    kind=link.kind,
                    display_name=link.name,
                )
            )

        if not new_tasks:
            return 0

        first = len(self._tasks)
        last = first + len(new_tasks) - 1
        self.beginInsertRows(QModelIndex(), first, last)
        self._tasks.extend(new_tasks)
        self.endInsertRows()
        self.countChanged.emit()
        return len(new_tasks)

    def task_at(self, row: int) -> LinkTask | None:
        if row < 0 or row >= len(self._tasks):
            return None
        return self._tasks[row]

    def rows_for_statuses(self, statuses: set[str]) -> list[int]:
        return [row for row, task in enumerate(self._tasks) if task.status in statuses]

    def find_row_by_id(self, task_id: int) -> int:
        for row, task in enumerate(self._tasks):
            if task.id == task_id:
                return row
        return -1

    def set_task_state(
        self,
        task_id: int,
        status: str,
        message: str = "",
        result_paths: list[str] | None = None,
    ) -> None:
        row = self.find_row_by_id(task_id)
        if row < 0:
            return
        task = self._tasks[row]
        task.status = status
        task.message = message
        task.result_paths = result_paths or []
        model_index = self.index(row, 0)
        self.dataChanged.emit(
            model_index,
            model_index,
            [self.StatusRole, self.MessageRole],
        )

    def remove_row(self, row: int) -> bool:
        if row < 0 or row >= len(self._tasks):
            return False
        self.beginRemoveRows(QModelIndex(), row, row)
        del self._tasks[row]
        self.endRemoveRows()
        self.countChanged.emit()
        return True

    def clear_done(self) -> int:
        return self._remove_rows([row for row, task in enumerate(self._tasks) if task.status == "done"])

    def clear_all(self) -> int:
        return self._remove_rows(list(range(len(self._tasks))))

    def _remove_rows(self, rows: list[int]) -> int:
        removed = 0
        for row in sorted(rows, reverse=True):
            if self.remove_row(row):
                removed += 1
        return removed


class PushSignals(QObject):
    finished = Signal(int, bool, str)


class PushWorker(QRunnable):
    def __init__(
        self,
        task_id: int,
        url: str,
        target_directory: str,
        check_folder_after_secs: int,
        api_token: str | None = None,
        client_factory: Callable = build_client,
    ) -> None:
        super().__init__()
        self.task_id = task_id
        self.url = url
        self.target_directory = target_directory
        self.check_folder_after_secs = check_folder_after_secs
        self.api_token = api_token
        self.client_factory = client_factory
        self.signals = PushSignals()

    @Slot()
    def run(self) -> None:
        client = self.client_factory(api_token=self.api_token or None)
        try:
            result = client.add_offline_file(
                url=self.url,
                to_folder=self.target_directory,
                check_folder_after_secs=self.check_folder_after_secs,
            )
            if result.get("success"):
                paths = result.get("resultFilePaths") or [self.target_directory]
                self.signals.finished.emit(self.task_id, True, "已推送到 " + ", ".join(paths))
            else:
                message = result.get("errorMessage") or "CloudDrive2 返回失败"
                self.signals.finished.emit(self.task_id, False, message)
        except Exception as exc:
            self.signals.finished.emit(self.task_id, False, str(exc))
        finally:
            client.close()


class ClipboardController(QObject):
    linksChanged = Signal()
    baseDirectoryChanged = Signal()
    targetDirectoryChanged = Signal()
    apiKeyChanged = Signal()
    apiKeyConfiguredChanged = Signal()
    alwaysOnTopChanged = Signal()
    statusTextChanged = Signal()

    def __init__(self, settings: QSettings | None = None, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._links = LinkListModel(self)
        self._settings = settings or QSettings("cd2api", "clipboard-helper")
        self._base_directory = self._read_base_directory()
        self._api_key = self._read_api_key()
        self._always_on_top = self._read_always_on_top()
        self._check_folder_after_secs = self._read_check_folder_after_secs()
        self._status_text = "监听剪贴板中"
        self._clipboard_connected = False
        self._last_clipboard_text = ""
        self._thread_pool = QThreadPool.globalInstance()

    @Property(QObject, constant=True)
    def links(self) -> LinkListModel:
        return self._links

    @Property(str, notify=baseDirectoryChanged)
    def baseDirectory(self) -> str:
        return self._base_directory

    @baseDirectory.setter
    def baseDirectory(self, value: str) -> None:
        normalized = normalize_base_directory(value)
        if normalized == self._base_directory:
            return
        self._base_directory = normalized
        self._settings.setValue("baseDirectory", normalized)
        self.baseDirectoryChanged.emit()
        self.targetDirectoryChanged.emit()

    @Property(str, notify=targetDirectoryChanged)
    def targetDirectory(self) -> str:
        return build_target_directory(self._base_directory)

    @Property(str, notify=apiKeyChanged)
    def apiKey(self) -> str:
        return self._api_key

    @apiKey.setter
    def apiKey(self, value: str) -> None:
        normalized = (value or "").strip()
        if normalized == self._api_key:
            return
        self._api_key = normalized
        self._settings.setValue("apiKey", normalized)
        self.apiKeyChanged.emit()
        self.apiKeyConfiguredChanged.emit()

    @Property(bool, notify=apiKeyConfiguredChanged)
    def apiKeyConfigured(self) -> bool:
        return bool(self._api_key)

    @Property(bool, notify=alwaysOnTopChanged)
    def alwaysOnTop(self) -> bool:
        return self._always_on_top

    @alwaysOnTop.setter
    def alwaysOnTop(self, value: bool) -> None:
        enabled = bool(value)
        if enabled == self._always_on_top:
            return
        self._always_on_top = enabled
        self._settings.setValue("alwaysOnTop", enabled)
        self.alwaysOnTopChanged.emit()

    @Property(str, constant=True)
    def todayString(self) -> str:
        return self.targetDirectory.rsplit("/", 1)[-1]

    @Property(str, notify=statusTextChanged)
    def statusText(self) -> str:
        return self._status_text

    def _read_base_directory(self) -> str:
        if self._settings.contains("baseDirectory"):
            value = self._settings.value("baseDirectory", "", str)
        else:
            value = os.getenv("CD2_GUI_BASE_DIR", DEFAULT_BASE_DIRECTORY)
        return normalize_base_directory(value)

    def _read_api_key(self) -> str:
        return (self._settings.value("apiKey", "", str) or "").strip()

    def _read_always_on_top(self) -> bool:
        value = self._settings.value("alwaysOnTop", True)
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() not in {"0", "false", "no", "off"}

    def _read_check_folder_after_secs(self) -> int:
        value = self._settings.value("checkFolderAfterSecs", 30)
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return 30
        return max(0, parsed)

    def _set_status_text(self, value: str) -> None:
        if value == self._status_text:
            return
        self._status_text = value
        self.statusTextChanged.emit()

    def start_clipboard_monitoring(self) -> None:
        app = QApplication.instance()
        if app is None or self._clipboard_connected:
            return
        clipboard = app.clipboard()
        clipboard.dataChanged.connect(self._handle_clipboard_changed)
        self._clipboard_connected = True
        if clipboard.text():
            self.add_links_from_text(clipboard.text())

    @Slot()
    def _handle_clipboard_changed(self) -> None:
        app = QApplication.instance()
        if app is None:
            return
        text = app.clipboard().text()
        if text == self._last_clipboard_text:
            return
        self._last_clipboard_text = text
        self.add_links_from_text(text)

    @Slot(str, result=int)
    def add_links_from_text(self, text: str) -> int:
        added = self._links.add_links(extract_links(text))
        if added:
            self.linksChanged.emit()
            self._set_status_text(f"新增 {added} 个链接")
        return added

    @Slot()
    def toggleAlwaysOnTop(self) -> None:
        self.alwaysOnTop = not self._always_on_top

    @Slot(int)
    def push(self, row: int) -> None:
        task = self._links.task_at(row)
        if task is None:
            self._set_status_text("未找到这条任务")
            return
        if task.status == "sending":
            return

        self._links.set_task_state(task.id, "sending", "正在推送")
        self._set_status_text(f"正在推送：{task.display_name}")
        worker = PushWorker(
            task_id=task.id,
            url=task.url,
            target_directory=self.targetDirectory,
            check_folder_after_secs=self._check_folder_after_secs,
            api_token=self._api_key or None,
        )
        worker.signals.finished.connect(self._handle_push_finished)
        self._thread_pool.start(worker)

    @Slot()
    def pushAll(self) -> None:
        rows = self._links.rows_for_statuses({"pending", "error"})
        if not rows:
            self._set_status_text("没有待推送的链接")
            return
        for row in rows:
            self.push(row)

    @Slot(int)
    def remove(self, row: int) -> None:
        if self._links.remove_row(row):
            self.linksChanged.emit()
            self._set_status_text("已移除链接")

    @Slot()
    def clearDone(self) -> None:
        removed = self._links.clear_done()
        if removed:
            self.linksChanged.emit()
            self._set_status_text(f"已清理 {removed} 个完成项")

    @Slot()
    def clearAll(self) -> None:
        removed = self._links.clear_all()
        if removed:
            self.linksChanged.emit()
            self._set_status_text("已清空列表")

    @Slot(int, bool, str)
    def _handle_push_finished(self, task_id: int, success: bool, message: str) -> None:
        status = "done" if success else "error"
        self._links.set_task_state(task_id, status, message)
        self._set_status_text(message)


_TASK_IDS = count(1)


def main() -> int:
    os.environ.setdefault("QT_QUICK_CONTROLS_STYLE", "Basic")

    app = QApplication(sys.argv)
    app.setOrganizationName("cd2api")
    app.setApplicationName("clipboard-helper")

    controller = ClipboardController()
    controller.start_clipboard_monitoring()

    engine = QQmlApplicationEngine()
    engine.rootContext().setContextProperty("controller", controller)
    engine.load(str(Path(__file__).resolve().parent / "qml" / "Main.qml"))
    if not engine.rootObjects():
        return 1
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
