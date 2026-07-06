from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_release_workflow_builds_and_publishes_windows_exe() -> None:
    workflow = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")

    assert "tags:" in workflow
    assert '"v*"' in workflow
    assert "runs-on: windows-latest" in workflow
    assert "uv sync --locked --group build" in workflow
    assert "Install UPX" in workflow
    assert "upx --version" in workflow
    assert "uv run pyinstaller --clean --noconfirm --upx-dir" in workflow
    assert "7z.exe" in workflow
    assert "-mx=9" in workflow
    assert "dist/CD2ClipboardHelper.exe" in workflow
    assert "softprops/action-gh-release@v2" in workflow
    assert "generate_release_notes: true" in workflow


def test_pyinstaller_spec_includes_qml_and_uses_windowed_exe() -> None:
    spec = (ROOT / "CD2ClipboardHelper.spec").read_text(encoding="utf-8")

    assert '["gui_app.py"]' in spec
    assert 'datas=[(str(root / "qml"), "qml")]' in spec
    assert "keep_qt_entry" in spec
    assert "drop_qt_prefixes" in spec
    assert "QtWebEngine" in spec
    assert "QtQuick3D" in spec
    assert "Qt6VirtualKeyboard" in spec
    assert 'name="CD2ClipboardHelper"' in spec
    assert "upx=True" in spec
    assert "console=False" in spec
