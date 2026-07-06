import os
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QCoreApplication, QSettings
from PySide6.QtQml import QQmlApplicationEngine
from PySide6.QtWidgets import QApplication

from gui_app import ClipboardController, PushWorker


def get_app() -> QApplication:
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    return app


def test_clipboard_controller_adds_links_and_exposes_target_directory(tmp_path) -> None:
    get_app()
    QCoreApplication.setOrganizationName("cd2api-tests")
    QCoreApplication.setApplicationName("clipboard-helper")
    QSettings.setPath(QSettings.Format.IniFormat, QSettings.Scope.UserScope, str(tmp_path))
    settings = QSettings(QSettings.Format.IniFormat, QSettings.Scope.UserScope, "cd2api-tests", "clipboard-helper")

    controller = ClipboardController(settings=settings)
    controller.baseDirectory = "\\115open\\javbus\\"
    controller.add_links_from_text(
        "magnet:?xt=urn:btih:abcdefabcdefabcdefabcdefabcdefabcdefabcd&dn=Movie "
        "ed2k://|file|Episode 1.mkv|42|0123456789ABCDEF|/"
    )
    controller.add_links_from_text("magnet:?xt=urn:btih:abcdefabcdefabcdefabcdefabcdefabcdefabcd&dn=Movie")

    assert controller.links.rowCount() == 2
    assert controller.targetDirectory.endswith("/115open/javbus/" + controller.todayString)


def test_clipboard_controller_persists_api_key(tmp_path) -> None:
    get_app()
    QSettings.setPath(QSettings.Format.IniFormat, QSettings.Scope.UserScope, str(tmp_path))
    settings = QSettings(QSettings.Format.IniFormat, QSettings.Scope.UserScope, "cd2api-tests", "api-key")

    controller = ClipboardController(settings=settings)
    assert controller.apiKey == ""
    assert controller.apiKeyConfigured is False

    controller.apiKey = "  token-from-gui  "
    assert controller.apiKey == "token-from-gui"
    assert controller.apiKeyConfigured is True

    reloaded = ClipboardController(
        settings=QSettings(QSettings.Format.IniFormat, QSettings.Scope.UserScope, "cd2api-tests", "api-key")
    )
    assert reloaded.apiKey == "token-from-gui"
    assert reloaded.apiKeyConfigured is True


def test_clipboard_controller_persists_always_on_top(tmp_path) -> None:
    get_app()
    QSettings.setPath(QSettings.Format.IniFormat, QSettings.Scope.UserScope, str(tmp_path))
    settings = QSettings(QSettings.Format.IniFormat, QSettings.Scope.UserScope, "cd2api-tests", "topmost")

    controller = ClipboardController(settings=settings)
    assert controller.alwaysOnTop is True

    controller.toggleAlwaysOnTop()
    assert controller.alwaysOnTop is False

    reloaded = ClipboardController(
        settings=QSettings(QSettings.Format.IniFormat, QSettings.Scope.UserScope, "cd2api-tests", "topmost")
    )
    assert reloaded.alwaysOnTop is False


def test_push_worker_passes_configured_api_key_to_client_factory() -> None:
    seen_tokens = []

    class FakeClient:
        def add_offline_file(self, url: str, to_folder: str, check_folder_after_secs: int) -> dict:
            return {"success": True, "errorMessage": "", "resultFilePaths": [to_folder]}

        def close(self) -> None:
            pass

    def fake_client_factory(api_token=None):
        seen_tokens.append(api_token)
        return FakeClient()

    worker = PushWorker(
        task_id=1,
        url="magnet:?xt=urn:btih:abcdef",
        target_directory="/115open/javbus/20260706",
        check_folder_after_secs=30,
        api_token="token-from-gui",
        client_factory=fake_client_factory,
    )

    worker.run()

    assert seen_tokens == ["token-from-gui"]


def test_main_qml_loads_with_controller(tmp_path) -> None:
    app = get_app()
    settings = QSettings(QSettings.Format.IniFormat, QSettings.Scope.UserScope, "cd2api-tests", "qml-smoke")
    controller = ClipboardController(settings=settings)
    engine = QQmlApplicationEngine()
    engine.rootContext().setContextProperty("controller", controller)
    engine.load(str(Path(__file__).resolve().parents[1] / "qml" / "Main.qml"))

    assert engine.rootObjects()
    for root in engine.rootObjects():
        root.deleteLater()
    engine.deleteLater()
    app.processEvents()


def test_main_qml_exposes_edge_auto_hide_settings(tmp_path) -> None:
    app = get_app()
    settings = QSettings(QSettings.Format.IniFormat, QSettings.Scope.UserScope, "cd2api-tests", "edge-auto-hide")
    controller = ClipboardController(settings=settings)
    engine = QQmlApplicationEngine()
    engine.rootContext().setContextProperty("controller", controller)
    engine.load(str(Path(__file__).resolve().parents[1] / "qml" / "Main.qml"))

    assert engine.rootObjects()
    root = engine.rootObjects()[0]
    assert root.property("autoHideEnabled") is True
    assert root.property("hiddenStripSize") == 2
    assert root.property("edgeSnapMargin") == 18
    assert root.property("edgeHideDelayMs") == 650
    assert root.property("currentEdge") == ""

    root.deleteLater()
    engine.deleteLater()
    app.processEvents()


def test_qml_drag_handlers_do_not_access_timer_ids_as_root_properties() -> None:
    qml = (Path(__file__).resolve().parents[1] / "qml" / "Main.qml").read_text(encoding="utf-8")

    assert "root.edgeHideTimer" not in qml
    assert "root.edgeSettleTimer" not in qml


def test_main_qml_reserves_scrollbar_space_and_colors_buttons(tmp_path) -> None:
    app = get_app()
    settings = QSettings(QSettings.Format.IniFormat, QSettings.Scope.UserScope, "cd2api-tests", "button-style")
    controller = ClipboardController(settings=settings)
    engine = QQmlApplicationEngine()
    engine.rootContext().setContextProperty("controller", controller)
    engine.load(str(Path(__file__).resolve().parents[1] / "qml" / "Main.qml"))

    assert engine.rootObjects()
    root = engine.rootObjects()[0]
    assert root.property("listScrollbarReserve") == 18
    assert root.property("primaryButtonColor") == "#2563eb"
    assert root.property("successButtonColor") == "#16a34a"
    assert root.property("dangerButtonColor") == "#dc2626"
    assert root.property("apiKeyFieldHeight") == 36
    assert root.property("settingsDialogWidth") == 420
    assert root.property("topIconButtonSize") == 32
    assert root.property("listIconButtonSize") == 34
    assert root.property("footerIconButtonSize") == 36
    assert root.property("apiKeyRevealButtonWidth") == 36

    qml = (Path(__file__).resolve().parents[1] / "qml" / "Main.qml").read_text(encoding="utf-8")
    assert "width: ListView.view.width - root.listScrollbarReserve" in qml
    assert "component IconButton" in qml
    assert "component IconGlyph" in qml
    assert "component ColoredButton" not in qml
    assert "controller.apiKey" in qml
    assert "TextInput.Password" in qml
    assert "id: settingsPopup" in qml
    assert "property bool apiKeyVisible: false" in qml
    assert "settingsPopup.open()" in qml
    assert "controller.toggleAlwaysOnTop()" in qml
    assert "(controller.alwaysOnTop || root.edgeHidden) ? Qt.WindowStaysOnTopHint : 0" in qml
    assert "settingsPopup.apiKeyVisible ? TextInput.Normal : TextInput.Password" in qml
    assert "settingsPopup.apiKeyVisible = !settingsPopup.apiKeyVisible" in qml
    assert 'text: "目标 " + controller.targetDirectory' not in qml
    assert "Layout.preferredHeight: 38" not in qml
    assert "Layout.preferredHeight: 140" not in qml

    root.deleteLater()
    engine.deleteLater()
    app.processEvents()


def test_main_qml_action_buttons_are_icon_only() -> None:
    qml = (Path(__file__).resolve().parents[1] / "qml" / "Main.qml").read_text(encoding="utf-8")

    assert "component IconButton" in qml
    assert "property string iconName" in qml
    assert "IconGlyph" in qml
    assert "ToolTip.text" in qml

    visible_button_text_bindings = [
        'text: controller.alwaysOnTop ? "置顶" : "普通"',
        'text: status === "sending" ? "推送中" : "推送"',
        'text: "移除"',
        'text: "推送全部"',
        'text: "清理完成"',
        'text: "清空"',
        'text: settingsPopup.apiKeyVisible ? "隐藏" : "显示"',
        'text: "取消"',
        'text: "保存"',
    ]
    for binding in visible_button_text_bindings:
        assert binding not in qml
