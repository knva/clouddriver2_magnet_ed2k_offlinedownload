import cd2_client
import pytest


class _FoundSpec:
    pass


def test_ensure_proto_generated_accepts_importable_bundled_stubs(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(cd2_client, "BASE_DIR", tmp_path)
    monkeypatch.setattr(cd2_client, "PROTO_PATH", tmp_path / "clouddrive.proto")
    monkeypatch.setattr(cd2_client, "GENERATED_FLAG", tmp_path / ".generated_clouddrive_stub")

    def fake_find_spec(name: str):
        if name in {"clouddrive_pb2", "clouddrive_pb2_grpc"}:
            return _FoundSpec()
        return None

    monkeypatch.setattr(cd2_client.importlib.util, "find_spec", fake_find_spec)

    cd2_client.ensure_proto_generated()


def test_ensure_proto_generated_still_reports_missing_proto_when_stubs_unavailable(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(cd2_client, "BASE_DIR", tmp_path)
    monkeypatch.setattr(cd2_client, "PROTO_PATH", tmp_path / "clouddrive.proto")
    monkeypatch.setattr(cd2_client, "GENERATED_FLAG", tmp_path / ".generated_clouddrive_stub")
    monkeypatch.setattr(cd2_client.importlib.util, "find_spec", lambda name: None)

    with pytest.raises(FileNotFoundError) as exc_info:
        cd2_client.ensure_proto_generated()
    assert str(tmp_path / "clouddrive.proto") in str(exc_info.value)


def test_add_offline_file_creates_missing_target_folders_before_push() -> None:
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

    result = client.add_offline_file(
        url="magnet:?xt=urn:btih:abcdef",
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
            "magnet:?xt=urn:btih:abcdef",
            "/115open/javbus/20260706",
            0,
            metadata,
        ),
    ]


def test_ensure_folder_exists_accepts_concurrent_create_when_folder_now_exists() -> None:
    calls = []
    existing_folders = set()

    class FakeStub:
        def FindFileByPath(self, request, metadata=None):
            calls.append(("find", request.parentPath, request.path))
            full_path = f"/{request.path}" if request.parentPath == "/" else f"{request.parentPath}/{request.path}"
            if full_path not in existing_folders:
                return cd2_client.clouddrive_pb2.CloudDriveFile()
            return cd2_client.clouddrive_pb2.CloudDriveFile(
                name=request.path,
                fullPathName=full_path,
                isDirectory=True,
                fileType=cd2_client.clouddrive_pb2.CloudDriveFile.FileType.Directory,
            )

        def CreateFolder(self, request, metadata=None):
            calls.append(("create", request.parentPath, request.folderName))
            existing_folders.add(
                f"/{request.folderName}"
                if request.parentPath == "/"
                else f"{request.parentPath}/{request.folderName}"
            )
            return cd2_client.clouddrive_pb2.CreateFolderResult(
                result=cd2_client.clouddrive_pb2.FileOperationResult(
                    success=False,
                    errorMessage="folder already exists",
                )
            )

    client = cd2_client.CloudDriveClient("127.0.0.1:1", api_token="token-from-test")
    client.stub = FakeStub()

    assert client.ensure_folder_exists("/115open") == "/115open"
    assert calls == [
        ("find", "/", "115open"),
        ("create", "/", "115open"),
        ("find", "/", "115open"),
    ]
