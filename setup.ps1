# Creates .env for the Docker Compose stack with generated secrets.
# Run with: powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (Test-Path .env) {
  Write-Host ".env already exists. Edit it directly, or delete it and run this script again."
  exit 1
}

function New-Secret([int]$Bytes) {
  $buffer = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  ($buffer | ForEach-Object { $_.ToString("x2") }) -join ""
}

function Read-Value([string]$Prompt, [string]$Default = "") {
  $suffix = if ($Default) { " [$Default]" } else { "" }
  $value = Read-Host "$Prompt$suffix"
  if ([string]::IsNullOrWhiteSpace($value)) { $Default } else { $value.Trim() }
}

$adminEmail = ""
while (-not $adminEmail) { $adminEmail = Read-Value "Admin email (dashboard login)" }

$values = [ordered]@{
  ADMIN_EMAIL           = $adminEmail
  ADMIN_PASSWORD        = New-Secret 12
  AWS_REGION            = Read-Value "AWS region" "us-east-1"
  AWS_ACCESS_KEY_ID     = Read-Value "AWS access key ID (Enter to fill in later)"
  AWS_SECRET_ACCESS_KEY = Read-Value "AWS secret access key (Enter to fill in later)"
  DO_API_TOKEN          = Read-Value "DigitalOcean API token (optional)"
  JWT_SECRET            = New-Secret 48
  POSTGRES_PASSWORD     = New-Secret 24
}

$lines = Get-Content .env.example | ForEach-Object {
  $key = ($_ -split "=", 2)[0]
  if ($values.Contains($key)) { "$key=$($values[$key])" } else { $_ }
}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot ".env"), (($lines -join "`n") + "`n"))

Write-Host ""
Write-Host "Wrote .env"
Write-Host "  Admin email:    $adminEmail"
Write-Host "  Admin password: $($values.ADMIN_PASSWORD)"
Write-Host ""
Write-Host "Start the stack:  docker compose up -d --build"
Write-Host "Then open:        http://localhost:3000"
