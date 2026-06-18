# FXConsole AE2026 Chinese Patch

Unofficial FXConsole AE2026 Chinese patch and updater package.

## Downloads

- `FXConsole.aex`: patched plugin file.
- `latest.json`: update manifest.
- `update_fxconsole_cn.ps1`: standalone updater script.
- `AEPluginUpdater_v0.1.0.zip`: After Effects CEP updater panel.
- `FXConsole_AE2026_CN_v0.14.0_release.zip`: complete release package.

## Update Sources

The updater checks the CDN mirror first, then GitHub Releases:

- CDN manifest: `https://cdn.jsdelivr.net/gh/AzusaMeows/AE-Plugin-Update-Hub@main/latest.json`
- GitHub manifest: `https://github.com/AzusaMeows/AE-Plugin-Update-Hub/releases/latest/download/latest.json`

## Standalone Update

Run PowerShell as administrator:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\update_fxconsole_cn.ps1
```

## AE Panel Update

Install the CEP panel from `AEPluginUpdater_v0.1.0.zip`, restart After Effects, then open:

```text
Window > Extensions > AE Plugin Updater
```

## Integrity

`FXConsole.aex` SHA256:

```text
E802E964E6505341A0AF57E965EBCC319D68EF65552A863D871F96727E1EA9E2
```

This is an unofficial compatibility patch for personal testing.
