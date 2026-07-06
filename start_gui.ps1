$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv not found. Install uv first, then rerun this script."
}

if (-not $env:CLOUDDRIVE_GRPC_ADDRESS) {
    $env:CLOUDDRIVE_GRPC_ADDRESS = "127.0.0.1:19798"
}

Write-Host "Using uv project: $scriptDir" -ForegroundColor Cyan
Write-Host "CloudDrive2 gRPC: $env:CLOUDDRIVE_GRPC_ADDRESS" -ForegroundColor Cyan
Write-Host "Starting CD2 clipboard helper..." -ForegroundColor Green

uv sync
if ($LASTEXITCODE -ne 0) {
    throw "uv sync failed."
}

uv run python gui_app.py
exit $LASTEXITCODE
