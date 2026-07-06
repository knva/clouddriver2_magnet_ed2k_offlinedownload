# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path


root = Path(SPECPATH)

a = Analysis(
    ["gui_app.py"],
    pathex=[str(root)],
    binaries=[],
    datas=[(str(root / "qml"), "qml")],
    hiddenimports=["clouddrive_pb2", "clouddrive_pb2_grpc"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

drop_qt_prefixes = (
    "PySide6/plugins/imageformats/",
    "PySide6/plugins/platforminputcontexts/",
    "PySide6/plugins/qmltooling/",
    "PySide6/qml/Qt3D/",
    "PySide6/qml/Qt5Compat/",
    "PySide6/qml/QtCharts/",
    "PySide6/qml/QtDataVisualization/",
    "PySide6/qml/QtGraphs/",
    "PySide6/qml/QtLocation/",
    "PySide6/qml/QtMultimedia/",
    "PySide6/qml/QtPositioning/",
    "PySide6/qml/QtQuick/Controls/FluentWinUI3/",
    "PySide6/qml/QtQuick/Controls/Fusion/",
    "PySide6/qml/QtQuick/Controls/Imagine/",
    "PySide6/qml/QtQuick/Controls/Material/",
    "PySide6/qml/QtQuick/Controls/Universal/",
    "PySide6/qml/QtQuick/Controls/Windows/",
    "PySide6/qml/QtQuick/Dialogs/",
    "PySide6/qml/QtQuick/Effects/",
    "PySide6/qml/QtQuick/LocalStorage/",
    "PySide6/qml/QtQuick/NativeStyle/",
    "PySide6/qml/QtQuick/Particles/",
    "PySide6/qml/QtQuick/Pdf/",
    "PySide6/qml/QtQuick/Scene2D/",
    "PySide6/qml/QtQuick/Scene3D/",
    "PySide6/qml/QtQuick/Shapes/",
    "PySide6/qml/QtQuick/Timeline/",
    "PySide6/qml/QtQuick/tooling/",
    "PySide6/qml/QtQuick/VectorImage/",
    "PySide6/qml/QtQuick/VirtualKeyboard/",
    "PySide6/qml/QtQuick3D/",
    "PySide6/qml/QtRemoteObjects/",
    "PySide6/qml/QtScxml/",
    "PySide6/qml/QtSensors/",
    "PySide6/qml/QtTest/",
    "PySide6/qml/QtTextToSpeech/",
    "PySide6/qml/QtWebChannel/",
    "PySide6/qml/QtWebEngine/",
    "PySide6/qml/QtWebSockets/",
    "PySide6/qml/QtWebView/",
)

drop_qt_dll_tokens = (
    "Qt63D",
    "Qt6Charts",
    "Qt6DataVisualization",
    "Qt6Graphs",
    "Qt6Labs",
    "Qt6Location",
    "Qt6Multimedia",
    "Qt6Pdf",
    "Qt6Positioning",
    "Qt6Quick3D",
    "Qt6QuickControls2FluentWinUI3",
    "Qt6QuickControls2Fusion",
    "Qt6QuickControls2Imagine",
    "Qt6QuickControls2Material",
    "Qt6QuickControls2Universal",
    "Qt6QuickControls2Windows",
    "Qt6QuickDialogs",
    "Qt6QuickEffects",
    "Qt6QuickParticles",
    "Qt6QuickTimeline",
    "Qt6QuickTest",
    "Qt6QuickVectorImage",
    "Qt6RemoteObjects",
    "Qt6Scxml",
    "Qt6Sensors",
    "Qt6SpatialAudio",
    "Qt6StateMachine",
    "Qt6TextToSpeech",
    "Qt6VirtualKeyboard",
    "Qt6WebChannel",
    "Qt6WebEngine",
    "Qt6WebSockets",
    "Qt6WebView",
)


def keep_qt_entry(entry):
    name = entry[0].replace("\\", "/")
    if any(name.startswith(prefix) for prefix in drop_qt_prefixes):
        return False
    if name.startswith("PySide6/Qt6") and any(token in name for token in drop_qt_dll_tokens):
        return False
    return True


a.binaries = [entry for entry in a.binaries if keep_qt_entry(entry)]
a.datas = [entry for entry in a.datas if keep_qt_entry(entry)]

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="CD2ClipboardHelper",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
