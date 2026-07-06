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
