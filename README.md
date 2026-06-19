# FXConsole AE2026 ????

Unofficial FXConsole AE2026 Chinese patch and updater package.

## Downloads

- `FXConsole.aex`: patched plugin file.
- `latest.json`: update manifest.
- `update_fxconsole_cn.ps1`: standalone updater script.
- `SuperPluginManager_v0.1.0.zxp`: signed CEP panel package.
- `SuperPluginManager_dropin_CEP_extensions_v0.1.0.zip`: signed folder package that can be copied into the CEP extensions directory.
- `AEPluginUpdater_v0.1.0.zip`: unsigned development package of the CEP panel.
- `FXConsole_AE2026_CN_v0.14.0_release.zip`: complete release package.

## Update Sources

The updater checks Gitee first, then CDN, then GitHub Releases:

- CDN manifest: `https://cdn.jsdelivr.net/gh/AzusaMeows/AE-Plugin-Update-Hub@main/latest.json`
- GitHub manifest: `https://github.com/AzusaMeows/AE-Plugin-Update-Hub/releases/latest/download/latest.json`

## Standalone Update

Run PowerShell as administrator:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\update_fxconsole_cn.ps1
```

## AE Panel Update

Recommended for normal users:

1. Install `SuperPluginManager_v0.1.0.zxp` with a ZXP installer.
2. Or unzip `SuperPluginManager_dropin_CEP_extensions_v0.1.0.zip` and copy the `AEPluginUpdater` folder to:

```text
%APPDATA%\Adobe\CEP\extensions
```

Then restart After Effects and open:

```text
Window > Extensions > 超级插件管理中心
```

In the panel, use `直接替换` after `下载并校验`. If the target file is locked or Program Files denies writing, the panel creates an offline install script and opens its folder. Close After Effects, then run that script.

Development install:

Install the CEP panel from `AEPluginUpdater_v0.1.0.zip`, restart After Effects, then open:

```text
Window > Extensions > ????????
```

## Integrity

`FXConsole.aex` SHA256:

```text
E802E964E6505341A0AF57E965EBCC319D68EF65552A863D871F96727E1EA9E2
```

This is an unofficial compatibility patch for personal testing.
