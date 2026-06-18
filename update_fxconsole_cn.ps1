param(
    [string]$InstallPath = "$env:ProgramFiles\Adobe\Adobe After Effects 2026\Support Files\Plug-ins\VideoCopilot\FXConsole.aex",
    [string[]]$ManifestUrls = @(
        "https://gitee.com/azusameow/ae-plugin-update-hub/raw/main/latest.json",
        "https://cdn.jsdelivr.net/gh/AzusaMeows/AE-Plugin-Update-Hub@main/latest.json",
        "https://github.com/AzusaMeows/AE-Plugin-Update-Hub/releases/latest/download/latest.json"
    ),
    [switch]$UseLocalManifest
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Read-Manifest {
    $localManifest = Join-Path $PSScriptRoot "latest.json"
    if ($UseLocalManifest -or (Test-Path -LiteralPath $localManifest)) {
        return Get-Content -LiteralPath $localManifest -Raw -Encoding UTF8 | ConvertFrom-Json
    }

    foreach ($url in $ManifestUrls) {
        if ($url -match "REPLACE_OWNER|REPLACE_REPO") {
            continue
        }

        try {
            Write-Host "Checking manifest: $url"
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
            return $response.Content | ConvertFrom-Json
        }
        catch {
            Write-Warning "Manifest failed: $url"
        }
    }

    throw "No update manifest could be loaded. Replace the placeholder URLs or place latest.json next to this script."
}

function Get-Download {
    param([object]$Manifest)

    foreach ($item in $Manifest.downloads) {
        $url = [string]$item.url
        if ($url -match "REPLACE_OWNER|REPLACE_REPO") {
            continue
        }

        try {
            $tempFile = Join-Path ([IO.Path]::GetTempPath()) ("FXConsole-" + $Manifest.version + ".aex")
            Write-Host "Downloading $($item.name): $url"
            Invoke-WebRequest -Uri $url -OutFile $tempFile -UseBasicParsing -TimeoutSec 120
            return $tempFile
        }
        catch {
            Write-Warning "Download failed: $($item.name)"
        }
    }

    $localFile = Join-Path $PSScriptRoot $Manifest.fileName
    if (Test-Path -LiteralPath $localFile) {
        Write-Host "Using local package: $localFile"
        return $localFile
    }

    throw "No downloadable FXConsole.aex was available."
}

function Assert-Hash {
    param(
        [string]$Path,
        [string]$ExpectedSha256
    )

    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actual -ne $ExpectedSha256.ToUpperInvariant()) {
        throw "SHA256 mismatch. Expected $ExpectedSha256 but got $actual."
    }
}

$manifest = Read-Manifest
$package = Get-Download -Manifest $manifest
Assert-Hash -Path $package -ExpectedSha256 $manifest.sha256

$installDir = Split-Path -Parent $InstallPath
if (-not (Test-Path -LiteralPath $installDir)) {
    throw "Install directory does not exist: $installDir"
}

if (Test-Path -LiteralPath $InstallPath) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = "$InstallPath.bak.$stamp"
    Copy-Item -LiteralPath $InstallPath -Destination $backup -Force
    Write-Host "Backup created: $backup"
}

Copy-Item -LiteralPath $package -Destination $InstallPath -Force
Write-Host "Updated FXConsole to version $($manifest.version): $InstallPath"
Write-Host "Verified SHA256: $($manifest.sha256)"
