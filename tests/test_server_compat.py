import cd2_client
import server


def test_server_uses_shared_cloud_drive_client() -> None:
    assert server.CloudDriveClient is cd2_client.CloudDriveClient


def test_offline_download_accepts_url_and_to_folder_aliases(monkeypatch) -> None:
    calls = []

    class FakeClient:
        def add_offline_file(self, url: str, to_folder: str, check_folder_after_secs: int) -> dict:
            calls.append((url, to_folder, check_folder_after_secs))
            return {"success": True, "errorMessage": "", "resultFilePaths": [to_folder]}

        def close(self) -> None:
            calls.append(("closed",))

    monkeypatch.setattr(server, "build_client", lambda: FakeClient())

    response = server.app.test_client().post(
        "/offline-download",
        json={"url": "ed2k://|file|A.mkv|1|HASH|/", "toFolder": "/115open/javbus/20260706", "checkFolderAfterSecs": 0},
    )

    assert response.status_code == 200
    assert response.get_json() == {
        "success": True,
        "errorMessage": "",
        "resultFilePaths": ["/115open/javbus/20260706"],
    }
    assert calls == [("ed2k://|file|A.mkv|1|HASH|/", "/115open/javbus/20260706", 0), ("closed",)]


def test_offline_download_still_validates_missing_directory() -> None:
    response = server.app.test_client().post(
        "/offline-download",
        json={"magnet": "magnet:?xt=urn:btih:abc"},
    )

    assert response.status_code == 400
    assert response.get_json() == {"success": False, "error": "Missing directory/toFolder"}
