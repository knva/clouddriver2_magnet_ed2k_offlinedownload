import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window

ApplicationWindow {
    id: root
    width: 480
    height: collapsed ? 68 : 620
    visible: true
    flags: Qt.FramelessWindowHint | Qt.Tool | ((controller.alwaysOnTop || root.edgeHidden) ? Qt.WindowStaysOnTopHint : 0)
    color: "transparent"
    title: "CD2 Clipboard"

    property bool collapsed: false
    property bool autoHideEnabled: true
    property bool edgeHidden: false
    property bool edgeAnimating: false
    property int hiddenStripSize: 2
    property int edgeSnapMargin: 18
    property int edgeHideDelayMs: 650
    property int listScrollbarReserve: 18
    property int apiKeyFieldHeight: 36
    property int settingsDialogWidth: 420
    property int topIconButtonSize: 32
    property int listIconButtonSize: 34
    property int footerIconButtonSize: 36
    property int apiKeyRevealButtonWidth: 36
    property string currentEdge: ""
    property color accent: "#2563eb"
    property color ink: "#111827"
    property color muted: "#6b7280"
    property string primaryButtonColor: "#2563eb"
    property string successButtonColor: "#16a34a"
    property string warningButtonColor: "#f59e0b"
    property string dangerButtonColor: "#dc2626"
    property string neutralButtonColor: "#64748b"

    Component.onCompleted: {
        x = Math.max(16, Screen.width - width - 24)
        y = 24
    }

    onXChanged: scheduleEdgeCheck()
    onYChanged: scheduleEdgeCheck()

    Behavior on x {
        enabled: root.edgeAnimating
        NumberAnimation {
            duration: 220
            easing.type: Easing.OutCubic
        }
    }

    Behavior on y {
        enabled: root.edgeAnimating
        NumberAnimation {
            duration: 220
            easing.type: Easing.OutCubic
        }
    }

    function screenWidth() {
        return Screen.width > 0 ? Screen.width : root.width
    }

    function screenHeight() {
        return Screen.height > 0 ? Screen.height : root.height
    }

    function clamp(value, minValue, maxValue) {
        if (maxValue < minValue)
            return minValue
        return Math.min(maxValue, Math.max(minValue, value))
    }

    function nearestEdge() {
        if (!autoHideEnabled)
            return ""
        if (root.y <= edgeSnapMargin)
            return "top"
        if (root.x <= edgeSnapMargin)
            return "left"
        if (root.x + root.width >= screenWidth() - edgeSnapMargin)
            return "right"
        return ""
    }

    function shownPosition(edge) {
        if (edge === "top") {
            return {
                "x": clamp(root.x, 8, screenWidth() - root.width - 8),
                "y": 0
            }
        }
        if (edge === "left") {
            return {
                "x": 0,
                "y": clamp(root.y, 8, screenHeight() - root.height - 8)
            }
        }
        if (edge === "right") {
            return {
                "x": screenWidth() - root.width,
                "y": clamp(root.y, 8, screenHeight() - root.height - 8)
            }
        }
        return {
            "x": root.x,
            "y": root.y
        }
    }

    function hiddenPosition(edge) {
        if (edge === "top") {
            return {
                "x": clamp(root.x, 8, screenWidth() - root.width - 8),
                "y": -root.height + hiddenStripSize
            }
        }
        if (edge === "left") {
            return {
                "x": -root.width + hiddenStripSize,
                "y": clamp(root.y, 8, screenHeight() - root.height - 8)
            }
        }
        if (edge === "right") {
            return {
                "x": screenWidth() - hiddenStripSize,
                "y": clamp(root.y, 8, screenHeight() - root.height - 8)
            }
        }
        return {
            "x": root.x,
            "y": root.y
        }
    }

    function animateTo(position) {
        edgeAnimating = true
        root.x = Math.round(position.x)
        root.y = Math.round(position.y)
        edgeAnimationResetTimer.restart()
    }

    function scheduleEdgeCheck() {
        if (!autoHideEnabled || edgeAnimating || edgeHidden)
            return
        edgeSettleTimer.restart()
    }

    function snapOrClearEdge() {
        const edge = nearestEdge()
        if (edge === "") {
            currentEdge = ""
            edgeHideTimer.stop()
            return
        }
        currentEdge = edge
        edgeHidden = false
        animateTo(shownPosition(edge))
        if (!edgeHover.hovered)
            edgeHideTimer.restart()
    }

    function hideToEdge() {
        if (currentEdge === "" || edgeHover.hovered)
            return
        edgeHidden = true
        animateTo(hiddenPosition(currentEdge))
    }

    function revealFromEdge() {
        if (currentEdge === "")
            return
        edgeHideTimer.stop()
        edgeHidden = false
        animateTo(shownPosition(currentEdge))
    }

    function handleHoverChanged(hovered) {
        if (!autoHideEnabled || currentEdge === "")
            return
        if (hovered) {
            revealFromEdge()
        } else {
            edgeHideTimer.restart()
        }
    }

    Timer {
        id: edgeSettleTimer
        interval: 220
        repeat: false
        onTriggered: root.snapOrClearEdge()
    }

    Timer {
        id: edgeHideTimer
        interval: root.edgeHideDelayMs
        repeat: false
        onTriggered: root.hideToEdge()
    }

    Timer {
        id: edgeAnimationResetTimer
        interval: 260
        repeat: false
        onTriggered: root.edgeAnimating = false
    }

    component IconGlyph: Canvas {
        id: iconGlyph
        property string iconName: ""
        property color strokeColor: "white"

        antialiasing: true

        onIconNameChanged: requestPaint()
        onStrokeColorChanged: requestPaint()
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()

        function prepare(ctx, width, height) {
            ctx.clearRect(0, 0, width, height)
            ctx.strokeStyle = iconGlyph.strokeColor
            ctx.fillStyle = iconGlyph.strokeColor
            ctx.lineWidth = Math.max(1.7, Math.min(width, height) * 0.11)
            ctx.lineCap = "round"
            ctx.lineJoin = "round"
        }

        function line(ctx, x1, y1, x2, y2) {
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.stroke()
        }

        function drawClose(ctx, cx, cy, s) {
            line(ctx, cx - s * 0.25, cy - s * 0.25, cx + s * 0.25, cy + s * 0.25)
            line(ctx, cx + s * 0.25, cy - s * 0.25, cx - s * 0.25, cy + s * 0.25)
        }

        function drawCheck(ctx, cx, cy, s) {
            ctx.beginPath()
            ctx.moveTo(cx - s * 0.32, cy + s * 0.02)
            ctx.lineTo(cx - s * 0.1, cy + s * 0.25)
            ctx.lineTo(cx + s * 0.34, cy - s * 0.26)
            ctx.stroke()
        }

        function drawUpload(ctx, cx, cy, s) {
            line(ctx, cx, cy + s * 0.28, cx, cy - s * 0.3)
            line(ctx, cx, cy - s * 0.3, cx - s * 0.18, cy - s * 0.09)
            line(ctx, cx, cy - s * 0.3, cx + s * 0.18, cy - s * 0.09)
            line(ctx, cx - s * 0.32, cy + s * 0.32, cx + s * 0.32, cy + s * 0.32)
        }

        function drawTrash(ctx, cx, cy, s) {
            line(ctx, cx - s * 0.28, cy - s * 0.22, cx + s * 0.28, cy - s * 0.22)
            line(ctx, cx - s * 0.1, cy - s * 0.34, cx + s * 0.1, cy - s * 0.34)
            line(ctx, cx - s * 0.2, cy - s * 0.12, cx - s * 0.15, cy + s * 0.32)
            line(ctx, cx + s * 0.2, cy - s * 0.12, cx + s * 0.15, cy + s * 0.32)
            line(ctx, cx - s * 0.15, cy + s * 0.32, cx + s * 0.15, cy + s * 0.32)
            line(ctx, cx - s * 0.06, cy - s * 0.04, cx - s * 0.04, cy + s * 0.22)
            line(ctx, cx + s * 0.06, cy - s * 0.04, cx + s * 0.04, cy + s * 0.22)
        }

        function drawEye(ctx, cx, cy, s, hidden) {
            ctx.beginPath()
            ctx.moveTo(cx - s * 0.42, cy)
            ctx.quadraticCurveTo(cx, cy - s * 0.3, cx + s * 0.42, cy)
            ctx.quadraticCurveTo(cx, cy + s * 0.3, cx - s * 0.42, cy)
            ctx.stroke()
            ctx.beginPath()
            ctx.arc(cx, cy, s * 0.08, 0, Math.PI * 2)
            ctx.fill()
            if (hidden)
                line(ctx, cx - s * 0.34, cy + s * 0.34, cx + s * 0.34, cy - s * 0.34)
        }

        onPaint: {
            const ctx = getContext("2d")
            const w = width
            const h = height
            const s = Math.min(w, h)
            const cx = w / 2
            const cy = h / 2
            prepare(ctx, w, h)

            if (iconName === "settings") {
                for (let i = 0; i < 8; i++) {
                    const angle = i * Math.PI / 4
                    line(ctx,
                         cx + Math.cos(angle) * s * 0.32,
                         cy + Math.sin(angle) * s * 0.32,
                         cx + Math.cos(angle) * s * 0.43,
                         cy + Math.sin(angle) * s * 0.43)
                }
                ctx.beginPath()
                ctx.arc(cx, cy, s * 0.18, 0, Math.PI * 2)
                ctx.stroke()
                return
            }

            if (iconName === "pin" || iconName === "pin-off") {
                ctx.beginPath()
                ctx.moveTo(cx - s * 0.2, cy - s * 0.32)
                ctx.lineTo(cx + s * 0.2, cy - s * 0.32)
                ctx.lineTo(cx + s * 0.08, cy - s * 0.02)
                ctx.lineTo(cx + s * 0.2, cy + s * 0.18)
                ctx.lineTo(cx + s * 0.03, cy + s * 0.18)
                ctx.lineTo(cx, cy + s * 0.42)
                ctx.lineTo(cx - s * 0.03, cy + s * 0.18)
                ctx.lineTo(cx - s * 0.2, cy + s * 0.18)
                ctx.lineTo(cx - s * 0.08, cy - s * 0.02)
                ctx.closePath()
                ctx.stroke()
                if (iconName === "pin-off")
                    line(ctx, cx - s * 0.34, cy + s * 0.34, cx + s * 0.34, cy - s * 0.34)
                return
            }

            if (iconName === "plus") {
                line(ctx, cx, cy - s * 0.32, cx, cy + s * 0.32)
                line(ctx, cx - s * 0.32, cy, cx + s * 0.32, cy)
                return
            }

            if (iconName === "minus") {
                line(ctx, cx - s * 0.34, cy, cx + s * 0.34, cy)
                return
            }

            if (iconName === "close") {
                drawClose(ctx, cx, cy, s)
                return
            }

            if (iconName === "upload") {
                drawUpload(ctx, cx, cy, s)
                return
            }

            if (iconName === "upload-all") {
                drawUpload(ctx, cx - s * 0.12, cy - s * 0.02, s * 0.72)
                drawUpload(ctx, cx + s * 0.16, cy + s * 0.06, s * 0.58)
                return
            }

            if (iconName === "trash") {
                drawTrash(ctx, cx, cy, s)
                return
            }

            if (iconName === "check") {
                drawCheck(ctx, cx, cy, s)
                return
            }

            if (iconName === "eye" || iconName === "eye-off") {
                drawEye(ctx, cx, cy, s, iconName === "eye-off")
            }
        }
    }

    component IconButton: Button {
        id: iconButton
        property string iconName: ""
        property string tooltipText: ""
        property color buttonColor: "#2563eb"
        property color hoverColor: Qt.darker(buttonColor, 1.08)
        property color pressedColor: Qt.darker(buttonColor, 1.18)
        property color disabledColor: "#cbd5e1"
        property color iconColor: "white"
        property int iconSize: 17

        hoverEnabled: true
        padding: 0
        implicitWidth: root.topIconButtonSize
        implicitHeight: root.topIconButtonSize
        ToolTip.visible: hovered && tooltipText.length > 0
        ToolTip.text: tooltipText

        background: Rectangle {
            radius: 7
            color: !iconButton.enabled ? iconButton.disabledColor :
                   iconButton.down ? iconButton.pressedColor :
                   iconButton.hovered ? iconButton.hoverColor :
                   iconButton.buttonColor
            border.width: 1
            border.color: !iconButton.enabled ? "#cbd5e1" : Qt.darker(iconButton.buttonColor, 1.12)
        }

        contentItem: Item {
            implicitWidth: iconButton.iconSize
            implicitHeight: iconButton.iconSize

            IconGlyph {
                anchors.centerIn: parent
                width: iconButton.iconSize
                height: iconButton.iconSize
                iconName: iconButton.iconName
                strokeColor: iconButton.enabled ? iconButton.iconColor : "#64748b"
            }
        }
    }

    Rectangle {
        id: shell
        anchors.fill: parent
        radius: 8
        color: "#f8fafc"
        border.color: "#dbe4ef"
        border.width: 1

        HoverHandler {
            id: edgeHover
            acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
            onHoveredChanged: root.handleHoverChanged(hovered)
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 14
            spacing: 12

            Rectangle {
                id: header
                Layout.fillWidth: true
                Layout.preferredHeight: 40
                color: "transparent"

                MouseArea {
                    anchors.fill: parent
                    acceptedButtons: Qt.LeftButton
                    onPressed: {
                        root.revealFromEdge()
                        root.currentEdge = ""
                        root.edgeHidden = false
                        edgeHideTimer.stop()
                        root.startSystemMove()
                    }
                    onReleased: edgeSettleTimer.restart()
                }

                RowLayout {
                    anchors.fill: parent
                    spacing: 10

                    Rectangle {
                        Layout.preferredWidth: 32
                        Layout.preferredHeight: 32
                        radius: 8
                        color: root.accent

                        Text {
                            anchors.centerIn: parent
                            text: "CD2"
                            color: "white"
                            font.pixelSize: 11
                            font.bold: true
                        }
                    }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 0

                        Text {
                            Layout.fillWidth: true
                            text: "剪贴板离线下载"
                            color: root.ink
                            font.pixelSize: 15
                            font.bold: true
                            elide: Text.ElideRight
                        }

                        Text {
                            Layout.fillWidth: true
                            text: controller.statusText
                            color: root.muted
                            font.pixelSize: 11
                            elide: Text.ElideRight
                        }
                    }

                    Rectangle {
                        Layout.preferredWidth: 34
                        Layout.preferredHeight: 24
                        radius: 7
                        color: "#e0ecff"

                        Text {
                            anchors.centerIn: parent
                            text: controller.links.count
                            color: root.accent
                            font.pixelSize: 12
                            font.bold: true
                        }
                    }

                    IconButton {
                        Layout.preferredWidth: root.topIconButtonSize
                        Layout.preferredHeight: root.topIconButtonSize
                        buttonColor: root.primaryButtonColor
                        iconName: "settings"
                        onClicked: settingsPopup.open()
                        tooltipText: "目录和 API Key"
                    }

                    IconButton {
                        Layout.preferredWidth: root.topIconButtonSize
                        Layout.preferredHeight: root.topIconButtonSize
                        buttonColor: controller.alwaysOnTop ? root.warningButtonColor : root.neutralButtonColor
                        iconName: controller.alwaysOnTop ? "pin" : "pin-off"
                        onClicked: controller.toggleAlwaysOnTop()
                        tooltipText: controller.alwaysOnTop ? "取消置顶" : "保持置顶"
                    }

                    IconButton {
                        Layout.preferredWidth: root.topIconButtonSize
                        Layout.preferredHeight: root.topIconButtonSize
                        buttonColor: root.neutralButtonColor
                        iconName: root.collapsed ? "plus" : "minus"
                        onClicked: root.collapsed = !root.collapsed
                        tooltipText: root.collapsed ? "展开" : "折叠"
                    }

                    IconButton {
                        Layout.preferredWidth: root.topIconButtonSize
                        Layout.preferredHeight: root.topIconButtonSize
                        buttonColor: root.dangerButtonColor
                        onClicked: Qt.quit()
                        iconName: "close"
                        tooltipText: "退出"
                    }
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 12
                visible: !root.collapsed

                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    radius: 8
                    color: "#ffffff"
                    border.color: "#e5e7eb"

                    StackLayout {
                        anchors.fill: parent
                        anchors.margins: 8
                        currentIndex: controller.links.count === 0 ? 0 : 1

                        Item {
                            Text {
                                anchors.centerIn: parent
                                text: "复制 magnet 或 ed2k 链接后会出现在这里"
                                color: root.muted
                                font.pixelSize: 13
                            }
                        }

                        ListView {
                            id: list
                            clip: true
                            spacing: 8
                            model: controller.links
                            rightMargin: root.listScrollbarReserve

                            delegate: Rectangle {
                                id: itemRoot
                                width: ListView.view.width - root.listScrollbarReserve
                                height: 108
                                radius: 8
                                color: status === "error" ? "#fff7ed" : "#f9fafb"
                                border.color: status === "error" ? "#fed7aa" : "#e5e7eb"

                                ColumnLayout {
                                    anchors.fill: parent
                                    anchors.margins: 10
                                    spacing: 6

                                    RowLayout {
                                        Layout.fillWidth: true
                                        spacing: 8

                                        Rectangle {
                                            Layout.preferredWidth: 52
                                            Layout.preferredHeight: 22
                                            radius: 6
                                            color: kind === "magnet" ? "#dbeafe" : "#dcfce7"

                                            Text {
                                                anchors.centerIn: parent
                                                text: kind
                                                color: kind === "magnet" ? "#1d4ed8" : "#15803d"
                                                font.pixelSize: 11
                                                font.bold: true
                                            }
                                        }

                                        Text {
                                            Layout.fillWidth: true
                                            text: displayName
                                            color: root.ink
                                            font.pixelSize: 13
                                            font.bold: true
                                            elide: Text.ElideRight
                                        }

                                        Text {
                                            text: status === "pending" ? "待推送" :
                                                  status === "sending" ? "发送中" :
                                                  status === "done" ? "完成" : "失败"
                                            color: status === "done" ? "#15803d" :
                                                   status === "error" ? "#c2410c" :
                                                   status === "sending" ? root.accent : root.muted
                                            font.pixelSize: 11
                                        }
                                    }

                                    Text {
                                        Layout.fillWidth: true
                                        text: shortUrl
                                        color: root.muted
                                        font.pixelSize: 11
                                        elide: Text.ElideMiddle
                                    }

                                    RowLayout {
                                        Layout.fillWidth: true
                                        spacing: 8

                                        Text {
                                            Layout.fillWidth: true
                                            text: message
                                            color: status === "error" ? "#c2410c" : root.muted
                                            font.pixelSize: 11
                                            elide: Text.ElideRight
                                        }

                                        IconButton {
                                            Layout.preferredWidth: root.listIconButtonSize
                                            Layout.preferredHeight: root.listIconButtonSize
                                            buttonColor: root.successButtonColor
                                            iconName: "upload"
                                            tooltipText: status === "sending" ? "推送中" : "推送"
                                            enabled: status !== "sending"
                                            onClicked: controller.push(index)
                                        }

                                        IconButton {
                                            Layout.preferredWidth: root.listIconButtonSize
                                            Layout.preferredHeight: root.listIconButtonSize
                                            buttonColor: root.dangerButtonColor
                                            iconName: "trash"
                                            tooltipText: "移除"
                                            enabled: status !== "sending"
                                            onClicked: controller.remove(index)
                                        }
                                    }
                                }
                            }

                            ScrollBar.vertical: ScrollBar {}
                        }
                    }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    IconButton {
                        Layout.fillWidth: true
                        Layout.preferredHeight: root.footerIconButtonSize
                        buttonColor: root.successButtonColor
                        iconName: "upload-all"
                        tooltipText: "推送全部"
                        enabled: controller.links.count > 0
                        onClicked: controller.pushAll()
                    }

                    IconButton {
                        Layout.preferredWidth: root.footerIconButtonSize
                        Layout.preferredHeight: root.footerIconButtonSize
                        buttonColor: root.warningButtonColor
                        iconName: "check"
                        tooltipText: "清理完成"
                        enabled: controller.links.count > 0
                        onClicked: controller.clearDone()
                    }

                    IconButton {
                        Layout.preferredWidth: root.footerIconButtonSize
                        Layout.preferredHeight: root.footerIconButtonSize
                        buttonColor: root.dangerButtonColor
                        iconName: "trash"
                        tooltipText: "清空"
                        enabled: controller.links.count > 0
                        onClicked: controller.clearAll()
                    }
                }
            }
        }

        Rectangle {
            id: edgeHandle
            z: 10
            visible: root.edgeHidden
            color: root.accent
            opacity: 0.92
            radius: 4
            width: root.currentEdge === "top" ? parent.width : root.hiddenStripSize
            height: root.currentEdge === "top" ? root.hiddenStripSize : parent.height
            x: root.currentEdge === "left" ? parent.width - width : 0
            y: root.currentEdge === "top" ? parent.height - height : 0
        }
    }

    Popup {
        id: settingsPopup
        property bool apiKeyVisible: false

        width: Math.min(root.settingsDialogWidth, root.width - 32)
        height: 238
        x: Math.round((root.width - width) / 2)
        y: 76
        modal: true
        focus: true
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

        background: Rectangle {
            radius: 8
            color: "#ffffff"
            border.color: "#cbd5e1"
            border.width: 1
        }

        contentItem: ColumnLayout {
            anchors.fill: parent
            anchors.margins: 16
            spacing: 12

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Text {
                    Layout.fillWidth: true
                    text: "设置"
                    color: root.ink
                    font.pixelSize: 16
                    font.bold: true
                }

                IconButton {
                    Layout.preferredWidth: root.topIconButtonSize
                    Layout.preferredHeight: root.topIconButtonSize
                    buttonColor: root.neutralButtonColor
                    iconName: "close"
                    tooltipText: "关闭设置"
                    onClicked: settingsPopup.close()
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.preferredHeight: root.apiKeyFieldHeight
                spacing: 8

                Text {
                    Layout.preferredWidth: 64
                    text: "基础目录"
                    color: root.ink
                    font.pixelSize: 12
                    font.bold: true
                }

                TextField {
                    id: settingsBaseDirectoryInput
                    Layout.fillWidth: true
                    text: controller.baseDirectory
                    selectByMouse: true
                    placeholderText: "/115open/javbus"
                    onEditingFinished: controller.baseDirectory = text
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.preferredHeight: root.apiKeyFieldHeight
                spacing: 8

                Text {
                    Layout.preferredWidth: 64
                    text: "API Key"
                    color: root.ink
                    font.pixelSize: 12
                    font.bold: true
                }

                TextField {
                    id: settingsApiKeyInput
                    Layout.fillWidth: true
                    text: controller.apiKey
                    selectByMouse: true
                    echoMode: settingsPopup.apiKeyVisible ? TextInput.Normal : TextInput.Password
                    placeholderText: "留空使用环境变量"
                    onEditingFinished: controller.apiKey = text
                }

                IconButton {
                    Layout.preferredWidth: root.apiKeyRevealButtonWidth
                    Layout.preferredHeight: root.apiKeyRevealButtonWidth
                    buttonColor: settingsPopup.apiKeyVisible ? root.warningButtonColor : root.neutralButtonColor
                    iconName: settingsPopup.apiKeyVisible ? "eye-off" : "eye"
                    tooltipText: settingsPopup.apiKeyVisible ? "隐藏 API Key" : "显示 API Key"
                    onClicked: settingsPopup.apiKeyVisible = !settingsPopup.apiKeyVisible
                }
            }

            Text {
                Layout.fillWidth: true
                text: "当前目标目录  " + controller.targetDirectory
                color: root.muted
                font.pixelSize: 11
                elide: Text.ElideMiddle
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Item {
                    Layout.fillWidth: true
                }

                IconButton {
                    Layout.preferredWidth: root.footerIconButtonSize
                    Layout.preferredHeight: root.footerIconButtonSize
                    buttonColor: root.neutralButtonColor
                    iconName: "close"
                    tooltipText: "取消"
                    onClicked: settingsPopup.close()
                }

                IconButton {
                    Layout.preferredWidth: root.footerIconButtonSize
                    Layout.preferredHeight: root.footerIconButtonSize
                    buttonColor: root.primaryButtonColor
                    iconName: "check"
                    tooltipText: "保存"
                    onClicked: {
                        controller.baseDirectory = settingsBaseDirectoryInput.text
                        controller.apiKey = settingsApiKeyInput.text
                        settingsPopup.close()
                    }
                }
            }
        }
    }
}
