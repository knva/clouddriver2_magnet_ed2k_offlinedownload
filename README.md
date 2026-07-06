# CloudDrive2 离线下载 API

这个项目提供一个 Python HTTP API 服务，监听 `59590` 端口，并调用 CloudDrive2 的 gRPC `AddOfflineFiles` 接口创建离线下载任务。

## 功能

- 接收磁力链接
- 接收目标目录
- 转发到 CloudDrive2 离线下载接口

## 前置条件

1. 本机或局域网里已经启动 CloudDrive2
2. CloudDrive2 的 gRPC 服务可访问，默认地址是 `127.0.0.1:19798`
3. 目标目录在 CloudDrive2 中支持离线下载
4. 本机安装 Python 3.10+

## 安装依赖

```bash
pip install -r requirements.txt
```

## 配置

推荐优先使用 API Token：

```powershell
$env:CLOUDDRIVE_API_TOKEN="你的令牌"
```

也可以用用户名密码：

```powershell
$env:CLOUDDRIVE_USERNAME="你的用户名"
$env:CLOUDDRIVE_PASSWORD="你的密码"
```

可选配置：

```powershell
$env:CLOUDDRIVE_GRPC_ADDRESS="127.0.0.1:19798"
$env:API_HOST="0.0.0.0"
$env:API_PORT="59590"
$env:CLOUDDRIVE_TOTP_CODE="123456"
```

## 启动

```powershell
python server.py
```

服务启动后：

- 健康检查：`GET /health`
- 创建离线下载：`POST /offline-download`

## 请求示例

```bash
curl -X POST http://127.0.0.1:59590/offline-download ^
  -H "Content-Type: application/json" ^
  -d "{\"magnet\":\"magnet:?xt=urn:btih:xxxx\",\"directory\":\"/你的目录\",\"checkFolderAfterSecs\":30}"
```

## 请求体

```json
{
  "magnet": "magnet:?xt=urn:btih:xxxx",
  "directory": "/你的目录",
  "checkFolderAfterSecs": 30
}
```

兼容字段：

- `magnet` 或 `url`
- `directory` 或 `toFolder`

## 返回示例

成功时：

```json
{
  "success": true,
  "errorMessage": "",
  "resultFilePaths": [
    "/你的目录"
  ]
}
```

失败时会返回 CloudDrive2 的错误信息，或者 gRPC 调用错误。

## 剪贴板悬浮助手

项目也提供一个 PySide6 + QML 桌面悬浮程序。它会监听剪贴板，发现 `magnet:` 或 `ed2k://` 链接后加入列表，用户可以单条或一键推送到 CloudDrive2 离线下载。

GUI 直接连接 CloudDrive2 gRPC，不需要先启动 `server.py`。认证仍使用同一组环境变量：

```powershell
$env:CLOUDDRIVE_API_TOKEN="你的令牌"
$env:CLOUDDRIVE_GRPC_ADDRESS="127.0.0.1:19798"
```

使用 uv 启动：

```powershell
uv sync
uv run python gui_app.py
```

或双击/运行：

```powershell
.\start_gui.ps1
```

默认基础目录是 `/115open/javbus`，实际推送目录会自动追加当天日期，例如 `/115open/javbus/20260706`。首次默认值也可以用 `CD2_GUI_BASE_DIR` 覆盖，之后会保存在本机 QSettings 中。

悬浮窗里也可以填写 CloudDrive2 API Key。界面中填写的 Key 会优先用于 GUI 推送；留空时继续使用 `CLOUDDRIVE_API_TOKEN` 等环境变量。
