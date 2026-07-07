# GUI Bulk Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the GUI "push all" action use one batch push request while keeping single-item push behavior unchanged.

**Architecture:** Add a batch method to the CloudDrive client, then add a dedicated GUI batch worker and completion handler that only `pushAll()` uses. Keep the single-item worker and controller flow unchanged so the regression surface stays small.

**Tech Stack:** Python 3.10+, PySide6/QML, pytest, gRPC-generated CloudDrive2 stubs

---

### Task 1: Add client batch API coverage

**Files:**
- Modify: `tests/test_cd2_client.py`
- Modify: `cd2_client.py`

- [ ] **Step 1: Write the failing test**

```python
def test_add_offline_files_batches_urls_into_one_rpc_call() -> None:
    calls = []
    existing_folders = {"/115open"}

    def folder_path(parent_path: str, folder_name: str) -> str:
        return f"/{folder_name}" if parent_path == "/" else f"{parent_path}/{folder_name}"

    class FakeStub:
        def FindFileByPath(self, request, metadata=None):
            calls.append(("find", request.parentPath, request.path, tuple(metadata or ())))
            full_path = folder_path(request.parentPath, request.path)
            if full_path not in existing_folders:
                return cd2_client.clouddrive_pb2.CloudDriveFile()
            return cd2_client.clouddrive_pb2.CloudDriveFile(
                name=request.path,
                fullPathName=full_path,
                isDirectory=True,
                fileType=cd2_client.clouddrive_pb2.CloudDriveFile.FileType.Directory,
            )

        def CreateFolder(self, request, metadata=None):
            calls.append(("create", request.parentPath, request.folderName, tuple(metadata or ())))
            full_path = folder_path(request.parentPath, request.folderName)
            existing_folders.add(full_path)
            return cd2_client.clouddrive_pb2.CreateFolderResult(
                folderCreated=cd2_client.clouddrive_pb2.CloudDriveFile(
                    name=request.folderName,
                    fullPathName=full_path,
                    isDirectory=True,
                    fileType=cd2_client.clouddrive_pb2.CloudDriveFile.FileType.Directory,
                ),
                result=cd2_client.clouddrive_pb2.FileOperationResult(success=True),
            )

        def AddOfflineFiles(self, request, metadata=None):
            calls.append(
                (
                    "add",
                    request.urls,
                    request.toFolder,
                    request.checkFolderAfterSecs,
                    tuple(metadata or ()),
                )
            )
            return cd2_client.clouddrive_pb2.FileOperationResult(
                success=True,
                resultFilePaths=[request.toFolder],
            )

    client = cd2_client.CloudDriveClient("127.0.0.1:1", api_token="token-from-test")
    client.stub = FakeStub()

    result = client.add_offline_files(
        urls=[
            "magnet:?xt=urn:btih:abcdef",
            "ed2k://|file|Episode 1.mkv|42|0123456789ABCDEF|/",
        ],
        to_folder="/115open/javbus/20260706",
        check_folder_after_secs=0,
    )

    metadata = (("authorization", "Bearer token-from-test"),)
    assert result == {
        "success": True,
        "errorMessage": "",
        "resultFilePaths": ["/115open/javbus/20260706"],
    }
    assert calls == [
        ("find", "/", "115open", metadata),
        ("find", "/115open", "javbus", metadata),
        ("create", "/115open", "javbus", metadata),
        ("find", "/115open/javbus", "20260706", metadata),
        ("create", "/115open/javbus", "20260706", metadata),
        (
            "add",
            "magnet:?xt=urn:btih:abcdef\ned2k://|file|Episode 1.mkv|42|0123456789ABCDEF|/",
            "/115open/javbus/20260706",
            0,
            metadata,
        ),
    ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cd2_client.py::test_add_offline_files_batches_urls_into_one_rpc_call -q`
Expected: FAIL with `AttributeError` because `CloudDriveClient.add_offline_files` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```python
def _normalize_offline_urls(urls: Sequence[str]) -> str:
    normalized = [url.strip() for url in urls if url and url.strip()]
    if not normalized:
        raise ValueError("At least one offline URL is required")
    return "\n".join(normalized)


def add_offline_files(
    self,
    urls: Sequence[str],
    to_folder: str,
    check_folder_after_secs: int = 30,
    ensure_to_folder: bool = True,
) -> dict:
    target_folder = self.ensure_folder_exists(to_folder) if ensure_to_folder else to_folder
    self.authenticate()
    response = self.stub.AddOfflineFiles(
        clouddrive_pb2.AddOfflineFileRequest(
            urls=_normalize_offline_urls(urls),
            toFolder=target_folder,
            checkFolderAfterSecs=check_folder_after_secs,
        ),
        metadata=self._metadata(),
    )
    return {
        "success": bool(response.success),
        "errorMessage": response.errorMessage,
        "resultFilePaths": list(response.resultFilePaths),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cd2_client.py::test_add_offline_files_batches_urls_into_one_rpc_call -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/test_cd2_client.py cd2_client.py
git commit -m "feat: add bulk offline push client support"
```

### Task 2: Switch GUI push-all to the batch client path

**Files:**
- Modify: `tests/test_gui_app.py`
- Modify: `gui_app.py`

- [ ] **Step 1: Write the failing test**

```python
def test_push_all_uses_single_batch_call_and_updates_selected_tasks(tmp_path) -> None:
    get_app()
    QSettings.setPath(QSettings.Format.IniFormat, QSettings.Scope.UserScope, str(tmp_path))
    settings = QSettings(QSettings.Format.IniFormat, QSettings.Scope.UserScope, "cd2api-tests", "push-all-batch")
    controller = ClipboardController(settings=settings)
    controller.add_links_from_text(
        "\n".join(
            [
                "magnet:?xt=urn:btih:aaaa",
                "magnet:?xt=urn:btih:bbbb",
                "magnet:?xt=urn:btih:cccc",
            ]
        )
    )
    controller.links.set_task_state(controller.links.task_at(2).id, "done", "existing")

    calls = []

    class FakeBatchClient:
        def add_offline_files(self, urls, to_folder: str, check_folder_after_secs: int) -> dict:
            calls.append((list(urls), to_folder, check_folder_after_secs))
            return {"success": True, "errorMessage": "", "resultFilePaths": [to_folder]}

        def close(self) -> None:
            calls.append(("closed",))

    class ImmediateThreadPool:
        def start(self, worker) -> None:
            worker.run()

    controller._thread_pool = ImmediateThreadPool()
    controller._client_factory = lambda api_token=None: FakeBatchClient()

    controller.pushAll()

    first = controller.links.task_at(0)
    second = controller.links.task_at(1)
    third = controller.links.task_at(2)
    assert first.status == "done"
    assert second.status == "done"
    assert third.status == "done"
    assert calls == [
        (
            ["magnet:?xt=urn:btih:aaaa", "magnet:?xt=urn:btih:bbbb"],
            controller.targetDirectory,
            30,
        ),
        ("closed",),
    ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_gui_app.py::test_push_all_uses_single_batch_call_and_updates_selected_tasks -q`
Expected: FAIL because `pushAll()` still loops through single-item pushes and the controller has no batch client hook yet.

- [ ] **Step 3: Write minimal implementation**

```python
class BatchPushSignals(QObject):
    finished = Signal(list, bool, str)


class BatchPushWorker(QRunnable):
    def __init__(
        self,
        task_ids: list[int],
        urls: list[str],
        target_directory: str,
        check_folder_after_secs: int,
        api_token: str | None = None,
        client_factory: Callable = build_client,
    ) -> None:
        ...

    @Slot()
    def run(self) -> None:
        client = self.client_factory(api_token=self.api_token or None)
        try:
            result = client.add_offline_files(
                urls=self.urls,
                to_folder=self.target_directory,
                check_folder_after_secs=self.check_folder_after_secs,
            )
            ...
        finally:
            client.close()


class ClipboardController(QObject):
    def __init__(...):
        ...
        self._client_factory = build_client

    @Slot()
    def pushAll(self) -> None:
        rows = self._links.rows_for_statuses({"pending", "error"})
        if not rows:
            self._set_status_text("没有待推送的链接")
            return
        tasks = [self._links.task_at(row) for row in rows]
        selected_tasks = [task for task in tasks if task is not None]
        for task in selected_tasks:
            self._links.set_task_state(task.id, "sending", "正在批量推送")
        self._set_status_text(f"正在批量推送 {len(selected_tasks)} 个链接")
        worker = BatchPushWorker(
            task_ids=[task.id for task in selected_tasks],
            urls=[task.url for task in selected_tasks],
            target_directory=self.targetDirectory,
            check_folder_after_secs=self._check_folder_after_secs,
            api_token=self._api_key or None,
            client_factory=self._client_factory,
        )
        worker.signals.finished.connect(self._handle_batch_push_finished)
        self._thread_pool.start(worker)

    @Slot(list, bool, str)
    def _handle_batch_push_finished(self, task_ids: list[int], success: bool, message: str) -> None:
        status = "done" if success else "error"
        for task_id in task_ids:
            self._links.set_task_state(task_id, status, message)
        self._set_status_text(message)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_gui_app.py::test_push_all_uses_single_batch_call_and_updates_selected_tasks -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/test_gui_app.py gui_app.py
git commit -m "feat: batch gui push-all requests"
```

### Task 3: Run full verification and prepare GitHub CI

**Files:**
- Modify: `docs/superpowers/specs/2026-07-07-gui-bulk-push-design.md`
- Modify: `docs/superpowers/plans/2026-07-07-gui-bulk-push.md`
- Verify: `tests/test_cd2_client.py`
- Verify: `tests/test_gui_app.py`

- [ ] **Step 1: Run targeted tests**

Run: `uv run pytest tests/test_cd2_client.py tests/test_gui_app.py -q`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `uv run pytest -q`
Expected: PASS

- [ ] **Step 3: Run compile verification**

Run: `uv run python -m compileall gui_app.py qml tests`
Expected: exit code 0

- [ ] **Step 4: Commit the completed work**

```bash
git add cd2_client.py gui_app.py tests/test_cd2_client.py tests/test_gui_app.py docs/superpowers/specs/2026-07-07-gui-bulk-push-design.md docs/superpowers/plans/2026-07-07-gui-bulk-push.md
git commit -m "feat: use bulk api for gui push-all"
```

- [ ] **Step 5: Push branch and start GitHub CI**

```bash
git push -u origin <feature-branch>
gh pr create --base main --fill
```

Expected: a PR URL is returned and the GitHub Actions `Test` job starts from the pull request event.
