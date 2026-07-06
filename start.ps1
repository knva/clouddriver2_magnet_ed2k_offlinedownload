$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$pythonExe = Join-Path $scriptDir ".venv\Scripts\python.exe"
$requirementsFile = Join-Path $scriptDir "requirements.txt"
$serverFile = Join-Path $scriptDir "server.py"

if (-not (Test-Path $pythonExe)) {
    throw "Virtualenv python not found: $pythonExe"
}

if (-not (Test-Path $serverFile)) {
    throw "Server file not found: $serverFile"
}

if (-not $env:CLOUDDRIVE_API_TOKEN -and -not ($env:CLOUDDRIVE_USERNAME -and $env:CLOUDDRIVE_PASSWORD)) {
    Write-Host "CLOUDDRIVE_API_TOKEN is not set. Set it in your shell, or set CLOUDDRIVE_USERNAME/CLOUDDRIVE_PASSWORD before starting." -ForegroundColor Yellow
}

if (-not $env:CLOUDDRIVE_GRPC_ADDRESS) {
    $env:CLOUDDRIVE_GRPC_ADDRESS = "127.0.0.1:19798"
}

if (-not $env:API_HOST) {
    $env:API_HOST = "0.0.0.0"
}

if (-not $env:API_PORT) {
    $env:API_PORT = "59590"
}

Write-Host "Using virtualenv: $pythonExe" -ForegroundColor Cyan
Write-Host "CloudDrive2 gRPC: $env:CLOUDDRIVE_GRPC_ADDRESS" -ForegroundColor Cyan
Write-Host "API address: http://127.0.0.1:$env:API_PORT" -ForegroundColor Cyan

Write-Host "Checking pip..." -ForegroundColor Yellow
& $pythonExe -m pip --version *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "pip not found, running ensurepip..." -ForegroundColor Yellow
    & $pythonExe -m ensurepip --upgrade
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install pip in the virtualenv."
    }
}

Write-Host "Installing dependencies..." -ForegroundColor Yellow
& $pythonExe -m pip install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/
if ($LASTEXITCODE -ne 0) {
    throw "Failed to upgrade pip."
}

& $pythonExe -m pip install -r $requirementsFile  -i https://mirrors.aliyun.com/pypi/simple/

if ($LASTEXITCODE -ne 0) {
    throw "Failed to install dependencies."
}

Write-Host "Starting offline download API..." -ForegroundColor Green
& $pythonExe $serverFile
