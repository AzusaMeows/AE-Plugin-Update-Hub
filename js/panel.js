(function () {
  "use strict";

  var cs = new CSInterface();
  var fs = null;
  var path = null;
  var os = null;
  var childProcess = null;
  var http = null;
  var https = null;
  var crypto = null;
  var nodeError = "";
  var busyPluginId = "";
  var restartRequiredPluginId = "";
  var pendingConfirm = null;
  var panelUpdateReady = false;
  var panelUpdateCheckedSource = null;
  var runningAePluginRootsCache = null;

  try {
    if (typeof require !== "function") {
      throw new Error("CEP Node.js 没有启用，require 不存在。");
    }
    fs = require("fs");
    path = require("path");
    os = require("os");
    childProcess = require("child_process");
    http = require("http");
    https = require("https");
    crypto = require("crypto");
  } catch (error) {
    nodeError = error.message || String(error);
  }

  var state = {
    repoPath: "",
    plugins: [],
    selectedId: "",
    customTarget: "",
    sourceMode: "auto",
    installed: {},
    configPath: nodeError ? "" : path.join(fromCepPath(cs.getSystemPath(SystemPath.USER_DATA)) || os.homedir(), "ZJIAN", "SuperPluginCenter", "config.json")
  };

  var remoteSources = [
    {
      id: "gitee",
      name: "Gitee 国内源",
      manifestUrl: "https://gitee.com/azusameow/ae-plugin-update-hub/raw/main/latest.json"
    },
    {
      id: "github",
      name: "GitHub 国际源",
      manifestUrl: "https://github.com/AzusaMeows/AE-Plugin-Update-Hub/releases/latest/download/latest.json"
    }
  ];

  var PANEL_VERSION = "1.1.6";
  var panelUpdateSources = [
    {
      id: "gitee",
      name: "Gitee 国内源",
      rawBase: "https://gitee.com/azusameow/ae-plugin-update-hub/raw/main/",
      manifestUrl: "https://gitee.com/azusameow/ae-plugin-update-hub/raw/main/CSXS/manifest.xml"
    },
    {
      id: "github",
      name: "GitHub 国际源",
      rawBase: "https://raw.githubusercontent.com/AzusaMeows/AE-Plugin-Update-Hub/main/",
      manifestUrl: "https://raw.githubusercontent.com/AzusaMeows/AE-Plugin-Update-Hub/main/CSXS/manifest.xml"
    }
  ];

  var panelUpdateFiles = [
    "CSXS/manifest.xml",
    "index.html",
    "styles.css",
    "js/CSInterface.js",
    "js/panel.js",
    "jsx/host.jsx",
    "plugin-center.example.json",
    "README.md"
  ];

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    renderHostInfo();
    bindEvents();
    if (nodeError) {
      disableNodeActions();
      log("初始化失败：" + nodeError + "\n请确认 manifest 里有 --enable-nodejs / --mixed-context，并重启 AE。", true);
      return;
    }
    ensureDir(path.dirname(state.configPath));
    loadConfig();
    scanRepo();
  }

  function cacheElements() {
    [
      "aeVersion",
      "platform",
      "choosePackageBtn",
      "chooseRepoBtn",
      "sourceMode",
      "checkRemoteBtn",
      "settingsBtn",
      "quickStatus",
      "refreshBtn",
      "openConfigBtn",
      "dropZone",
      "pluginCount",
      "pluginList",
      "emptyState",
      "detailView",
      "detailName",
      "detailType",
      "detailDescription",
      "installMode",
      "customTargetWrap",
      "customTarget",
      "pickCustomTargetBtn",
      "targetPreview",
      "installBtn",
      "uninstallBtn",
      "uninstallAllBtn",
      "revealBtn",
      "openTargetBtn",
      "log",
      "confirmModal",
      "confirmTitle",
      "confirmMessage",
      "confirmOkBtn",
      "confirmCancelBtn",
      "confirmCloseBtn",
      "settingsModal",
      "settingsCloseBtn",
      "checkPanelUpdateBtn",
      "updatePanelBtn",
      "panelVersion",
      "panelUpdateStatus",
      "panelUpdatePercent",
      "panelUpdateProgressBar",
      "openExtensionBtn",
      "openConfigVisibleBtn"
    ].forEach(function (id) {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els.choosePackageBtn.addEventListener("click", choosePackage);
    els.chooseRepoBtn.addEventListener("click", chooseRepo);
    els.sourceMode.value = "auto";
    els.checkRemoteBtn.addEventListener("click", checkRemotePackages);
    els.settingsBtn.addEventListener("click", openSettings);
    els.settingsCloseBtn.addEventListener("click", closeSettings);
    els.settingsModal.addEventListener("click", function (event) {
      if (event.target === els.settingsModal) closeSettings();
    });
    els.checkPanelUpdateBtn.addEventListener("click", checkPanelUpdate);
    els.updatePanelBtn.addEventListener("click", updatePanel);
    if (els.openExtensionBtn) {
      els.openExtensionBtn.addEventListener("click", function () {
        revealPath(currentExtensionPath());
      });
    }
    if (els.openConfigVisibleBtn) {
      els.openConfigVisibleBtn.addEventListener("click", function () {
        saveConfig();
        revealPath(state.configPath);
      });
    }
    els.refreshBtn.addEventListener("click", scanRepo);
    els.openConfigBtn.addEventListener("click", function () {
      saveConfig();
      revealPath(state.configPath);
    });
    els.installMode.addEventListener("change", renderTargetPreview);
    els.customTarget.addEventListener("input", function () {
      state.customTarget = els.customTarget.value.trim();
      saveConfig();
      renderTargetPreview();
    });
    els.pickCustomTargetBtn.addEventListener("click", pickCustomTarget);
    els.installBtn.addEventListener("click", installSelected);
    els.uninstallBtn.addEventListener("click", uninstallSelected);
    els.uninstallAllBtn.addEventListener("click", uninstallAllVersionsSelected);
    els.confirmCancelBtn.addEventListener("click", closeConfirm);
    els.confirmCloseBtn.addEventListener("click", closeConfirm);
    els.confirmModal.addEventListener("click", function (event) {
      if (event.target === els.confirmModal) closeConfirm();
    });
    els.confirmOkBtn.addEventListener("click", function () {
      var action = pendingConfirm;
      closeConfirm();
      if (typeof action === "function") action();
    });
    els.revealBtn.addEventListener("click", function () {
      var plugin = selectedPlugin();
      if (!plugin) return;
      if (plugin.remote) {
        log("在线来源：" + plugin.sourcePath);
        return;
      }
      revealPath(plugin.sourcePath);
    });
    els.openTargetBtn.addEventListener("click", function () {
      var plugin = selectedPlugin();
      if (!plugin) return;
      if (plugin.remote) {
        var status = installedStatus(plugin);
        if (status.installed && status.record && status.record.targetDirs && status.record.targetDirs[0]) {
          revealPath(status.record.targetDirs[0]);
          return;
        }
        log("在线插件安装后才能打开目标目录。");
        return;
      }
      var targets = buildInstallPlan(plugin).map(function (item) { return item.targetDir; });
      if (targets[0]) revealPath(targets[0]);
    });

    if (els.dropZone) {
      ["dragenter", "dragover"].forEach(function (eventName) {
        els.dropZone.addEventListener(eventName, function (event) {
          event.preventDefault();
          els.dropZone.classList.add("dragging");
        });
      });
      ["dragleave", "drop"].forEach(function (eventName) {
        els.dropZone.addEventListener(eventName, function (event) {
          event.preventDefault();
          els.dropZone.classList.remove("dragging");
        });
      });
      els.dropZone.addEventListener("drop", function (event) {
        var file = event.dataTransfer.files && event.dataTransfer.files[0];
        if (file && file.path) addPackage(file.path);
      });
    }
  }

  function renderHostInfo() {
    var host = cs.getHostEnvironment() || {};
    els.aeVersion.textContent = "AE：" + (host.appVersion || "未知版本");
  }

  function disableNodeActions() {
    ["choosePackageBtn", "chooseRepoBtn", "sourceMode", "checkRemoteBtn", "settingsBtn", "refreshBtn", "openConfigBtn", "installBtn", "uninstallBtn", "uninstallAllBtn", "revealBtn", "openTargetBtn", "pickCustomTargetBtn", "checkPanelUpdateBtn", "updatePanelBtn"].forEach(function (id) {
      if (els[id]) els[id].disabled = true;
    });
    els.pluginCount.textContent = "NODE OFF";
  }

  function choosePackage() {
    var chosen = choosePath("请选择插件包文件夹；zip 或单文件可直接粘贴路径", true);
    if (chosen) addPackage(chosen);
  }

  function chooseRepo() {
    var chosen = choosePath("请选择你的插件仓库文件夹", true);
    if (!chosen) return;
    state.repoPath = chosen;
    saveConfig();
    scanRepo();
  }

  function pickCustomTarget() {
    var chosen = choosePath("请选择自定义安装目录", true);
    if (!chosen) return;
    state.customTarget = chosen;
    els.customTarget.value = chosen;
    saveConfig();
    renderTargetPreview();
  }

  function choosePath(message, chooseDirectory) {
    var chosen = cepDialog(message, chooseDirectory);
    if (chosen) return chosen;
    return promptForPath(message);
  }

  function cepDialog(message, chooseDirectory) {
    try {
      if (window.cep && window.cep.fs && typeof window.cep.fs.showOpenDialogEx === "function") {
        var result = window.cep.fs.showOpenDialogEx(false, !!chooseDirectory, message, "", [], "");
        if (result && result.data && result.data.length) {
          return normalizePath(result.data[0]);
        }
      }
      if (window.cep && window.cep.fs && typeof window.cep.fs.showOpenDialog === "function") {
        var legacy = window.cep.fs.showOpenDialog(false, !!chooseDirectory, message, "", []);
        if (legacy && legacy.data && legacy.data.length) {
          return normalizePath(legacy.data[0]);
        }
      }
    } catch (error) {
      log("系统选择器不可用，改用路径输入：" + error.message, true);
    }
    return "";
  }

  function promptForPath(message) {
    var input = window.prompt(message + "\n可以直接粘贴完整路径：", "");
    return input ? normalizePath(input.replace(/^"|"$/g, "")) : "";
  }

  function addPackage(packagePath) {
    packagePath = normalizePath(packagePath);
    if (!fs.existsSync(packagePath)) {
      log("路径不存在：" + packagePath, true);
      return;
    }
    if (path.extname(packagePath).toLowerCase() === ".zip") {
      packagePath = extractZip(packagePath);
      if (!packagePath) return;
    }
    var plugin = inspectPackage(packagePath);
    upsertPlugin(plugin);
    state.selectedId = plugin.id;
    saveConfig();
    render();
    log("已加入插件包：" + plugin.name);
  }

  function scanRepo() {
    state.plugins = [];
    if (state.repoPath && fs.existsSync(state.repoPath)) {
      safeReaddir(state.repoPath).forEach(function (entry) {
        var full = path.join(state.repoPath, entry);
        if (isHidden(entry)) return;
        try {
          upsertPlugin(inspectPackage(full));
        } catch (error) {
          log("跳过 " + entry + "：" + error.message, true);
        }
      });
    }
    render();
  }

  function inspectPackage(sourcePath) {
    var stat = fs.statSync(sourcePath);
    var manifestPath = stat.isDirectory() ? path.join(sourcePath, "plugin-center.json") : "";
    var manifest = {};
    if (manifestPath && fs.existsSync(manifestPath)) {
      manifest = readJson(manifestPath);
    }

    var items = manifest.items || discoverItems(sourcePath);
    var name = manifest.name || path.basename(sourcePath, path.extname(sourcePath));
    var type = manifest.type || inferPackageType(items);
    return {
      id: manifest.id || slug(name + "-" + sourcePath),
      name: name,
      description: manifest.description || autoDescription(items),
      version: manifest.version || "",
      type: type,
      sourcePath: sourcePath,
      items: items,
      postInstall: manifest.postInstall || ""
    };
  }

  function discoverItems(sourcePath) {
    var stat = fs.statSync(sourcePath);
    var items = [];

    if (stat.isFile()) {
      items.push(itemFromFile(sourcePath, path.dirname(sourcePath)));
      return items.filter(Boolean);
    }

    if (fs.existsSync(path.join(sourcePath, "CSXS", "manifest.xml"))) {
      items.push({
        kind: "cep",
        source: ".",
        name: path.basename(sourcePath)
      });
      return items;
    }

    walk(sourcePath, function (filePath) {
      var rel = normalizePath(path.relative(sourcePath, filePath));
      var item = itemFromFile(filePath, sourcePath);
      if (item) {
        item.source = rel;
        items.push(item);
      }
    });

    return items;
  }

  function itemFromFile(filePath, root) {
    if (fs.statSync(filePath).isDirectory() && fs.existsSync(path.join(filePath, "CSXS", "manifest.xml"))) {
      return { kind: "cep", source: normalizePath(path.relative(root, filePath)), name: path.basename(filePath) };
    }
    var ext = path.extname(filePath).toLowerCase();
    var base = path.basename(filePath);
    if (ext === ".aex" || ext === ".plugin") return { kind: "native", source: normalizePath(path.relative(root, filePath)), name: base };
    if (ext === ".jsx" || ext === ".jsxbin") return { kind: "script", source: normalizePath(path.relative(root, filePath)), name: base };
    if (ext === ".ffx") return { kind: "preset", source: normalizePath(path.relative(root, filePath)), name: base };
    return null;
  }

  function inferPackageType(items) {
    var kinds = unique(items.map(function (item) { return item.kind; }));
    if (kinds.length === 1) return labelKind(kinds[0]);
    return "混合插件包";
  }

  function autoDescription(items) {
    if (!items.length) return "未识别到可安装文件，请添加 plugin-center.json 描述安装内容。";
    return "识别到 " + items.length + " 个安装项：" + unique(items.map(function (item) { return labelKind(item.kind); })).join("、");
  }

  function render() {
    els.pluginCount.textContent = state.plugins.length + " 个";
    els.pluginList.innerHTML = "";
    state.plugins.forEach(function (plugin) {
      var status = installedStatus(plugin);
      var allStatus = allVersionsStatus(plugin);
      var item = document.createElement("div");
      item.className = "plugin-item" + (plugin.id === state.selectedId ? " active" : "");
      item.innerHTML = "<strong></strong><span></span>";
      item.querySelector("strong").textContent = plugin.name;
      item.querySelector("span").textContent = (plugin.version ? plugin.version + " · " : "") + plugin.type + (status.installed ? " · 已安装" : (allStatus.installed ? " · 其它版本已安装" : ""));
      item.addEventListener("click", function () {
        state.selectedId = plugin.id;
        saveConfig();
        render();
      });
      els.pluginList.appendChild(item);
    });
    renderDetails();
  }

  function renderDetails() {
    var plugin = selectedPlugin();
    if (!plugin) {
      els.emptyState.classList.remove("hidden");
      els.detailView.classList.add("hidden");
      return;
    }
    els.emptyState.classList.add("hidden");
    els.detailView.classList.remove("hidden");
    els.detailName.textContent = plugin.name + (plugin.version ? " " + plugin.version : "");
    var status = installedStatus(plugin);
    var allStatus = allVersionsStatus(plugin);
    var locked = restartLocked();
    els.detailType.textContent = status.installed ? (status.updateAvailable ? "可更新" : "已安装") : plugin.type;
    els.detailDescription.textContent = plugin.description;
    els.installBtn.disabled = locked || busyPluginId === plugin.id;
    els.installBtn.textContent = buttonText(plugin, status);
    els.uninstallBtn.classList.toggle("hidden", !status.installed);
    els.uninstallBtn.disabled = locked || busyPluginId === plugin.id;
    els.uninstallAllBtn.classList.toggle("hidden", !allStatus.installed);
    els.uninstallAllBtn.disabled = locked || busyPluginId === plugin.id;
    els.customTarget.value = state.customTarget || "";
    renderTargetPreview();
    if (locked) {
      log("安装已完成，请重启 AE 后再继续操作。");
      return;
    }
    log((status.installed ? "已安装：" : (allStatus.installed ? "其它 AE 版本已安装：" : "准备安装：")) + plugin.name + "\n源路径：" + plugin.sourcePath);
  }

  function renderTargetPreview() {
    var mode = els.installMode.value;
    els.customTargetWrap.classList.toggle("hidden", mode !== "custom");
    var plugin = selectedPlugin();
    if (!plugin) return;
    if (plugin.remote) {
      var roots = targetRoots(mode);
      els.targetPreview.textContent = "在线插件会先下载到本地缓存，然后安装到：\n" + (roots.appPlugins || roots.commonPlugins || roots.userData);
      return;
    }
    var plan = buildInstallPlan(plugin);
    els.targetPreview.textContent = plan.map(function (item) {
      return "[" + labelKind(item.kind) + "] " + item.sourcePath + "\n→ " + item.targetPath;
    }).join("\n\n") || "没有可安装项。";
  }

  function buttonText(plugin, status) {
    if (restartLocked()) return "请重启 AE";
    if (busyPluginId === plugin.id) {
      if (status && status.installed && !status.updateAvailable) return "检查中…";
      return plugin.remote ? "下载中…" : "安装中…";
    }
    if (status && status.installed) {
      return status.updateAvailable ? "下载更新" : "检查更新";
    }
    return plugin.remote ? "下载并安装" : "安装";
  }

  function restartLocked() {
    return !!restartRequiredPluginId;
  }

  function installSelected() {
    try {
      var plugin = selectedPlugin();
      if (!plugin) return;
      if (busyPluginId) {
        log("已有任务正在进行，请稍等。", true);
        return;
      }
      if (restartLocked()) {
        log("刚刚安装了插件，请先重启 AE，再进行安装、更新或卸载。", true);
        return;
      }
      var status = installedStatus(plugin);
      if (status.installed && !status.updateAvailable) {
        checkSelectedUpdate(plugin);
        return;
      }
      busyPluginId = plugin.id;
      render();
      log((plugin.remote ? "准备下载并安装：" : "准备安装：") + plugin.name);
      if (plugin.remote) {
        downloadRemotePlugin(plugin, function (error, localPath) {
          if (error) {
            log("下载失败：" + error.message, true);
            busyPluginId = "";
            render();
            return;
          }
          try {
            var localPlugin = inspectPackage(localPath);
            localPlugin.id = plugin.id;
            localPlugin.name = plugin.name;
            localPlugin.version = plugin.version;
            localPlugin.description = plugin.description;
            installLocalPlugin(localPlugin, plugin);
          } catch (inspectError) {
            log("下载完成，但无法识别安装包：" + inspectError.message, true);
          }
          busyPluginId = "";
          render();
        });
        return;
      }
      installLocalPlugin(plugin, plugin);
      busyPluginId = "";
      render();
    } catch (error) {
      log("操作失败：" + error.message, true);
      busyPluginId = "";
      render();
    }
  }

  function installLocalPlugin(plugin, ownerPlugin) {
    var plan = buildInstallPlan(plugin);
    if (!plan.length) {
      log("没有可安装项。请检查 plugin-center.json 或插件包内容。", true);
      return;
    }

    log("开始安装 " + plugin.name + " …");
    try {
      plan.forEach(function (item) {
        try {
          ensureDir(item.targetDir);
          copyAny(item.sourcePath, item.targetPath);
        } catch (copyError) {
          if (isAccessError(copyError) && os.platform() === "win32") {
            log("需要管理员权限安装到：" + item.targetPath);
            copyAnyElevated(item.sourcePath, item.targetPath);
          } else {
            throw copyError;
          }
        }
        log("已安装：" + item.targetPath);
      });
      recordInstalled(ownerPlugin || plugin, plan);
      restartRequiredPluginId = (ownerPlugin || plugin).id || plugin.id;
      if (plugin.postInstall) {
        cs.evalScript("superPluginCenter_postInstall(" + JSON.stringify(plugin.postInstall) + ")", function (result) {
          if (result) log(result);
        });
      }
      log("安装完成。请先重启 AE，重启前已锁定安装/更新/卸载操作。");
    } catch (error) {
      log("安装失败：" + error.message + "\n如果目标是 Program Files，请用管理员权限启动 AE，或改用用户目录模式。", true);
    }
  }

  function uninstallSelected() {
    var plugin = selectedPlugin();
    if (!plugin) return;
    if (restartLocked()) {
      log("刚刚安装了插件，请先重启 AE，再进行卸载。", true);
      return;
    }
    var status = installedStatus(plugin);
    if (!status.installed || !status.record) {
      log("没有找到这个插件的安装记录。", true);
      return;
    }
    confirmAction("卸载插件", "卸载“" + plugin.name + "”？\n会删除本管理中心识别到的安装文件。\n如果文件在 Program Files，请允许 Windows 管理员权限；若 AE 正在占用，确认后关闭 AE 即可自动完成。", function () {
      performUninstall(plugin, status);
    });
  }

  function uninstallAllVersionsSelected() {
    var plugin = selectedPlugin();
    if (!plugin) return;
    if (restartLocked()) {
      log("刚刚安装了插件，请先重启 AE，再进行卸载所有版本。", true);
      return;
    }
    var status = allVersionsStatus(plugin);
    if (!status.installed || !status.record) {
      log("没有找到任何 AE 版本里的安装文件。", true);
      return;
    }
    confirmAction("卸载所有 AE 版本", "卸载“" + plugin.name + "”的所有 AE 版本残留？\n将删除这些文件：\n" + status.record.paths.join("\n") + "\n\n如果文件在 Program Files，请允许 Windows 管理员权限；若 AE 正在占用，确认后关闭 AE 即可自动完成。", function () {
      performUninstall(plugin, status);
    });
  }

  function performUninstall(plugin, status) {
    try {
      (status.record.paths || []).forEach(function (targetPath) {
        var result = removeAny(targetPath);
        log((result === "scheduled" ? "已安排关闭 AE 后删除：" : "已删除：") + targetPath);
      });
      cleanupEmptyDirs(status.record.targetDirs || []);
      delete state.installed[plugin.id];
      saveConfig();
      render();
      log("卸载流程已提交：" + plugin.name + "\n如果刚刚允许了管理员权限，请保存工程并关闭 AE，插件会在 AE 关闭后自动删除。");
    } catch (error) {
      log("卸载失败：" + error.message + "\n如果弹出了管理员权限窗口，请允许后再试；如果 AE 正在占用插件，请关闭 AE 后卸载。", true);
    }
  }

  function confirmAction(title, message, onConfirm) {
    pendingConfirm = onConfirm;
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmModal.classList.remove("hidden");
    els.confirmOkBtn.focus();
  }

  function closeConfirm() {
    pendingConfirm = null;
    if (els.confirmModal) els.confirmModal.classList.add("hidden");
  }

  function openSettings() {
    els.panelVersion.textContent = "当前版本：" + PANEL_VERSION;
    resetPanelUpdateReady("请先检查更新。");
    els.settingsModal.classList.remove("hidden");
  }

  function closeSettings() {
    els.settingsModal.classList.add("hidden");
  }

  function setPanelProgress(percent, message) {
    percent = Math.max(0, Math.min(100, Math.round(percent || 0)));
    if (els.panelUpdateStatus) els.panelUpdateStatus.textContent = message || "";
    if (els.panelUpdatePercent) els.panelUpdatePercent.textContent = percent + "%";
    if (els.panelUpdateProgressBar) els.panelUpdateProgressBar.style.width = percent + "%";
  }

  function resetPanelUpdateReady(message) {
    panelUpdateReady = false;
    panelUpdateCheckedSource = null;
    if (els.updatePanelBtn) els.updatePanelBtn.disabled = true;
    setPanelProgress(0, message || "请先检查更新。");
  }

  function checkPanelUpdate() {
    if (busyPluginId) {
      log("已有任务正在进行，请稍等。", true);
      return;
    }
    var sources = orderedPanelUpdateSources();
    panelUpdateReady = false;
    panelUpdateCheckedSource = null;
    els.updatePanelBtn.disabled = true;
    els.checkPanelUpdateBtn.disabled = true;
    els.checkPanelUpdateBtn.textContent = "检查中…";
    setPanelProgress(12, "正在检查远端版本…");
    log("正在检查面板更新：" + sources.map(function (source) { return source.name; }).join(" → "));
    tryPanelVersionSource(sources, 0, function (error, result) {
      els.checkPanelUpdateBtn.disabled = false;
      els.checkPanelUpdateBtn.textContent = "检查更新";
      if (error) {
        panelUpdateReady = false;
        panelUpdateCheckedSource = null;
        els.updatePanelBtn.disabled = true;
        setPanelProgress(0, "检查失败：" + error.message);
        log("检查面板更新失败：" + error.message, true);
        return;
      }
      var message = "当前版本：" + PANEL_VERSION + " / 远端版本：" + result.version + "（" + result.source.name + "）";
      els.panelVersion.textContent = message;
      if (compareVersions(result.version, PANEL_VERSION) > 0) {
        panelUpdateReady = true;
        panelUpdateCheckedSource = result.source;
        els.updatePanelBtn.disabled = false;
        setPanelProgress(100, "发现新版本：" + result.version);
        log("发现面板新版本：" + PANEL_VERSION + " → " + result.version);
      } else {
        panelUpdateReady = false;
        panelUpdateCheckedSource = null;
        els.updatePanelBtn.disabled = true;
        setPanelProgress(100, "已经是最新版本");
        log("面板已经是最新版本：" + PANEL_VERSION);
      }
    });
  }

  function updatePanel() {
    if (busyPluginId) {
      log("已有任务正在进行，请稍等。", true);
      return;
    }
    var sources = orderedPanelUpdateSources();
    if (!sources.length) {
      log("没有可用面板更新源。", true);
      return;
    }
    if (!panelUpdateReady) {
      setPanelProgress(0, "请先检查更新。");
      log("请先检查更新，确认有新版本后再立即更新。", true);
      return;
    }
    if (panelUpdateCheckedSource) {
      sources = [panelUpdateCheckedSource];
    }
    busyPluginId = "__panel_update__";
    els.checkPanelUpdateBtn.disabled = true;
    els.updatePanelBtn.disabled = true;
    els.updatePanelBtn.textContent = "更新中…";
    setPanelProgress(5, "准备更新…");
    log("正在更新管理中心面板：" + sources.map(function (source) { return source.name; }).join(" → "));
    tryPanelUpdateSource(sources, 0, function (error) {
      busyPluginId = "";
      els.checkPanelUpdateBtn.disabled = false;
      els.updatePanelBtn.disabled = true;
      els.updatePanelBtn.textContent = "立即更新";
      if (error) {
        panelUpdateReady = false;
        panelUpdateCheckedSource = null;
        setPanelProgress(0, "更新失败：" + error.message);
        log("面板更新失败：" + error.message, true);
        return;
      }
      panelUpdateReady = false;
      panelUpdateCheckedSource = null;
      setPanelProgress(100, "更新完成，请重启 AE 或重新打开面板后生效。");
      log("面板更新完成。请重启 AE 或重新打开面板后生效。");
    });
  }

  function orderedPanelUpdateSources() {
    return panelUpdateSources.slice(0);
  }

  function tryPanelVersionSource(sources, index, callback) {
    if (index >= sources.length) {
      callback(new Error("所有面板更新源都无法读取版本。"));
      return;
    }
    var source = sources[index];
    downloadText(source.manifestUrl, function (error, text) {
      if (error) {
        log(source.name + " 版本检查失败，尝试下一个源。\n原因：" + error.message, true);
        tryPanelVersionSource(sources, index + 1, callback);
        return;
      }
      var version = parsePanelVersion(text);
      if (!version) {
        log(source.name + " 没有读到面板版本，尝试下一个源。", true);
        tryPanelVersionSource(sources, index + 1, callback);
        return;
      }
      callback(null, { source: source, version: version });
    });
  }

  function tryPanelUpdateSource(sources, index, callback) {
    if (index >= sources.length) {
      callback(new Error("所有面板更新源都失败。"));
      return;
    }
    var source = sources[index];
    var updateDir = path.join(path.dirname(state.configPath), "PanelUpdates");
    var sourceRoot = path.join(updateDir, source.id + "-raw-" + Date.now());
    ensureDir(updateDir);
    ensureDir(sourceRoot);
    log("正在下载面板文件：" + source.name);
    setPanelProgress(10, "正在连接：" + source.name);
    downloadPanelFiles(source, sourceRoot, 0, function (downloadError) {
      if (downloadError) {
        log(source.name + " 文件下载失败，尝试下一个源。\n原因：" + downloadError.message, true);
        tryPanelUpdateSource(sources, index + 1, callback);
        return;
      }
      try {
        setPanelProgress(92, "正在应用更新…");
        applyPanelUpdate(sourceRoot);
        callback(null);
      } catch (applyError) {
        log(source.name + " 应用更新失败，尝试下一个源。\n原因：" + applyError.message, true);
        tryPanelUpdateSource(sources, index + 1, callback);
      }
    });
  }

  function downloadPanelFiles(source, targetRoot, index, callback) {
    if (index >= panelUpdateFiles.length) {
      callback(null);
      return;
    }
    var rel = panelUpdateFiles[index];
    var target = path.join(targetRoot, rel);
    ensureDir(path.dirname(target));
    var percent = 10 + Math.round((index / panelUpdateFiles.length) * 80);
    setPanelProgress(percent, "正在下载：" + rel);
    downloadFile(source.rawBase + rel, target, function (error) {
      if (error) {
        callback(new Error(rel + " 下载失败：" + error.message));
        return;
      }
      downloadPanelFiles(source, targetRoot, index + 1, callback);
    });
  }

  function applyPanelUpdate(sourceRoot) {
    if (!fs.existsSync(path.join(sourceRoot, "CSXS", "manifest.xml")) || !fs.existsSync(path.join(sourceRoot, "js", "panel.js"))) {
      throw new Error("下载的面板文件不完整。");
    }
    var targetRoot = currentExtensionPath();
    if (!targetRoot) {
      throw new Error("无法定位当前 CEP 面板目录。");
    }
    copyPanelFiles(sourceRoot, targetRoot);
  }

  function copyPanelFiles(sourceRoot, targetRoot) {
    ["CSXS", "js", "jsx", "index.html", "styles.css", "plugin-center.example.json", "README.md"].forEach(function (item) {
      var source = path.join(sourceRoot, item);
      if (!fs.existsSync(source)) return;
      copyAny(source, path.join(targetRoot, item));
    });
  }

  function parsePanelVersion(text) {
    var match = String(text || "").match(/ExtensionBundleVersion="([^"]+)"/);
    return match ? match[1] : "";
  }

  function currentExtensionPath() {
    return fromCepPath(cs.getSystemPath(SystemPath.EXTENSION)) || path.dirname(path.dirname(state.configPath));
  }

  function checkSelectedUpdate(plugin) {
    if (restartLocked()) {
      log("刚刚安装了插件，请先重启 AE，再检查更新。", true);
      return;
    }
    if (!plugin.remote) {
      log("本地插件已安装。这个条目没有在线来源，暂时不能自动检查更新。");
      return;
    }
    busyPluginId = plugin.id;
    render();
    log("正在检查更新：" + plugin.name);
    fetchFirstManifest(orderedRemoteSources(), 0, function (error, result) {
      busyPluginId = "";
      if (error) {
        log("检查更新失败：" + error.message, true);
        render();
        return;
      }
      var plugins = normalizeRemoteManifest(result.json, result.source);
      var latest = plugins.filter(function (item) { return item.id === plugin.id; })[0] || plugins[0];
      if (latest) upsertPlugin(latest);
      var current = state.installed[plugin.id] || {};
      if (latest && compareVersions(latest.version, current.version) > 0) {
        log("发现新版本：" + current.version + " → " + latest.version + "\n按钮已切换为“下载更新”。");
      } else {
        log("已经是最新版本：" + (current.version || plugin.version || "未知版本"));
      }
      saveConfig();
      render();
    });
  }

  function checkRemotePackages() {
    var sources = orderedRemoteSources();
    if (!sources.length) {
      log("没有可用下载源。", true);
      return;
    }
    els.checkRemoteBtn.disabled = true;
    els.checkRemoteBtn.textContent = "连接中…";
    log("正在检查在线插件：" + sources.map(function (source) { return source.name; }).join(" → "));
    fetchFirstManifest(sources, 0, function (error, result) {
      els.checkRemoteBtn.disabled = false;
      els.checkRemoteBtn.textContent = "在线检查";
      if (error) {
        log("在线源检查失败：" + error.message, true);
        return;
      }
      var plugins = normalizeRemoteManifest(result.json, result.source);
      if (!plugins.length) {
        log("在线源已连接，但没有发现插件条目。", true);
        return;
      }
      plugins.forEach(upsertPlugin);
      render();
      log("已连接 " + result.source.name + "，发现 " + plugins.length + " 个在线插件。");
    });
  }

  function orderedRemoteSources() {
    return remoteSources.slice(0);
  }

  function fetchFirstManifest(sources, index, callback) {
    if (index >= sources.length) {
      callback(new Error("所有下载源都无法连接。"));
      return;
    }
    fetchJson(sources[index].manifestUrl, function (error, json) {
      if (!error) {
        callback(null, { source: sources[index], json: json });
        return;
      }
      log(sources[index].name + " 连接失败，尝试下一个源。", true);
      fetchFirstManifest(sources, index + 1, callback);
    });
  }

  function normalizeRemoteManifest(json, source) {
    var list = [];
    if (json.plugins && json.plugins.length) {
      list = json.plugins;
    } else if (json.downloads && json.downloads.length) {
      list = [json];
    }

    return list.map(function (item) {
      var downloads = item.downloads || [];
      return {
        id: "remote-" + (item.id || slug(item.name || source.id)),
        name: item.name || "在线插件",
        description: item.description || (item.notes ? item.notes.join("\n") : "来自 " + source.name + " 的在线插件。"),
        version: item.version || "",
        type: "在线插件",
        sourcePath: source.manifestUrl,
        items: [{ kind: "remote", name: item.fileName || item.name || "download" }],
        remote: {
          sourceId: source.id,
          fileName: item.fileName || guessFileName(downloads),
          sha256: item.sha256 || "",
          downloads: downloads
        }
      };
    });
  }

  function guessFileName(downloads) {
    if (!downloads || !downloads.length) return "plugin-package.zip";
    var raw = downloads[0].url || "";
    var clean = raw.split("?")[0].split("#")[0];
    return path.basename(clean) || "plugin-package.zip";
  }

  function downloadRemotePlugin(plugin, callback) {
    var downloads = orderedDownloads(plugin.remote.downloads || []);
    if (!downloads.length) {
      callback(new Error("这个在线插件没有下载地址。"));
      return;
    }
    var cacheDir = path.join(path.dirname(state.configPath), "Downloads", plugin.id);
    ensureDir(cacheDir);
    tryDownload(downloads, 0, cacheDir, plugin, callback);
  }

  function orderedDownloads(downloads) {
    return downloads.slice(0).sort(function (a, b) {
      var scoreA = /gitee/i.test(a.name || a.url || "") ? 0 : 1;
      var scoreB = /gitee/i.test(b.name || b.url || "") ? 0 : 1;
      return scoreA - scoreB;
    });
  }

  function tryDownload(downloads, index, cacheDir, plugin, callback) {
    if (index >= downloads.length) {
      callback(new Error("所有下载地址都失败。"));
      return;
    }
    var item = downloads[index];
    var fileName = plugin.remote.fileName || path.basename((item.url || "").split("?")[0]) || "plugin-package.zip";
    var target = path.join(cacheDir, fileName);
    log("正在下载：" + (item.name || item.url));
    downloadFile(item.url, target, function (error) {
      if (error) {
        log("下载源失败：" + (item.name || item.url) + "\n原因：" + error.message, true);
        tryDownload(downloads, index + 1, cacheDir, plugin, callback);
        return;
      }
      if (plugin.remote.sha256 && !verifySha256(target, plugin.remote.sha256)) {
        log("校验失败：" + target, true);
        tryDownload(downloads, index + 1, cacheDir, plugin, callback);
        return;
      }
      log("下载完成：" + target);
      callback(null, target);
    });
  }

  function fetchJson(url, callback) {
    downloadText(url, function (error, text) {
      if (error) {
        callback(error);
        return;
      }
      try {
        callback(null, JSON.parse(text));
      } catch (parseError) {
        callback(parseError);
      }
    });
  }

  function downloadText(url, callback) {
    requestUrl(url, function (error, response) {
      if (error) {
        callback(error);
        return;
      }
      var chunks = [];
      response.on("data", function (chunk) { chunks.push(chunk); });
      response.on("end", function () { callback(null, Buffer.concat(chunks).toString("utf8")); });
    });
  }

  function downloadFile(url, target, callback) {
    if (os && os.platform && os.platform() === "win32") {
      downloadFileWithPowerShell(url, target, callback);
      return;
    }
    requestUrl(url, function (error, response) {
      if (error) {
        callback(error);
        return;
      }
      var file = fs.createWriteStream(target);
      response.pipe(file);
      file.on("finish", function () {
        file.close(function () { callback(null); });
      });
      file.on("error", callback);
    });
  }

  function downloadFileWithPowerShell(url, target, callback) {
    var script = "& { param($url, $outFile) [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -Uri $url -OutFile $outFile; if (!(Test-Path -LiteralPath $outFile)) { throw '下载后没有生成文件。' }; if ((Get-Item -LiteralPath $outFile).Length -le 0) { throw '下载文件大小为 0。' } }";
    childProcess.execFile("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
      url,
      target
    ], { timeout: 180000 }, function (error, stdout, stderr) {
      if (error) {
        callback(new Error((stderr || error.message || "PowerShell 下载失败").trim()));
        return;
      }
      callback(null);
    });
  }

  function requestUrl(url, callback, redirects) {
    redirects = redirects || 0;
    if (redirects > 5) {
      callback(new Error("重定向次数过多。"));
      return;
    }
    var client = /^https:/i.test(url) ? https : http;
    var request = client.get(url, function (response) {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        var nextUrl = response.headers.location;
        if (!/^https?:/i.test(nextUrl)) {
          var parsed = require("url").parse(url);
          nextUrl = parsed.protocol + "//" + parsed.host + nextUrl;
        }
        requestUrl(nextUrl, callback, redirects + 1);
        return;
      }
      if (response.statusCode !== 200) {
        callback(new Error("HTTP " + response.statusCode));
        return;
      }
      callback(null, response);
    });
    request.on("error", callback);
    request.setTimeout(30000, function () {
      request.abort();
      callback(new Error("连接超时。"));
    });
  }

  function verifySha256(filePath, expected) {
    var actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
    return actual === String(expected).toUpperCase();
  }

  function buildInstallPlan(plugin) {
    var mode = els.installMode.value;
    var roots = targetRoots(mode);
    var sourceRoot = fs.statSync(plugin.sourcePath).isDirectory() ? plugin.sourcePath : path.dirname(plugin.sourcePath);
    return plugin.items.map(function (item) {
      var source = path.resolve(sourceRoot, item.source || ".");
      if (!fs.existsSync(source) && fs.existsSync(plugin.sourcePath) && fs.statSync(plugin.sourcePath).isFile()) source = plugin.sourcePath;
      var targetDir = item.target ? expandTarget(item.target, roots) : defaultTargetDir(item.kind, roots, plugin);
      var targetName = item.targetName || item.name || path.basename(source);
      if (!item.target && item.kind === "native" && mode !== "custom") {
        var existingNative = findExistingNativeTargets(targetName, roots, false)[0];
        if (existingNative) targetDir = path.dirname(existingNative);
      }
      if (item.kind === "cep" && item.source === ".") targetName = item.targetName || plugin.id;
      return {
        kind: item.kind,
        sourcePath: source,
        targetDir: targetDir,
        targetPath: path.join(targetDir, targetName)
      };
    });
  }

  function targetRoots(mode) {
    var userData = fromCepPath(cs.getSystemPath(SystemPath.USER_DATA)) || path.join(os.homedir(), "AppData", "Roaming");
    var docs = fromCepPath(cs.getSystemPath(SystemPath.MY_DOCUMENTS)) || path.join(os.homedir(), "Documents");
    var common = fromCepPath(cs.getSystemPath(SystemPath.COMMON_FILES)) || process.env.CommonProgramFiles || "C:\\Program Files\\Common Files";
    var app = appRootPath(fromCepPath(cs.getSystemPath(SystemPath.APPLICATION)) || "");
    var appPlugins = resolveAppPlugins(app);
    var custom = state.customTarget || els.customTarget.value.trim();
    var hostVersion = (cs.getHostEnvironment().appVersion || "24.0").split(".");
    var aeVersion = hostVersion[0] + ".0";
    return {
      mode: mode,
      userData: userData,
      documents: docs,
      commonPlugins: path.join(common, "Adobe", "Plug-ins", "7.0", "MediaCore"),
      appPlugins: appPlugins,
      cepExtensions: path.join(userData, "Adobe", "CEP", "extensions"),
      userScripts: path.join(userData, "Adobe", "After Effects", aeVersion, "Scripts", "ScriptUI Panels"),
      userPresets: path.join(docs, "Adobe", "After Effects User Presets"),
      custom: custom
    };
  }

  function appRootPath(appPath) {
    if (!appPath) return "";
    try {
      if (fs.existsSync(appPath) && fs.statSync(appPath).isFile()) {
        return path.dirname(appPath);
      }
    } catch (error) {
      // 读取不到也继续按目录处理。
    }
    if (/\.exe$/i.test(appPath)) return path.dirname(appPath);
    return appPath;
  }

  function resolveAppPlugins(appRoot) {
    var candidates = [];
    candidates = candidates.concat(runningAePluginRoots());
    candidates = candidates.concat(discoverAePluginRoots(true)).concat(discoverAePluginRoots(false));
    if (appRoot && !isExtensionPath(appRoot)) {
      candidates.push(path.join(appRoot, "Plug-ins"));
      candidates.push(path.join(appRoot, "Support Files", "Plug-ins"));
      candidates.push(path.join(path.dirname(appRoot), "Plug-ins"));
      candidates.push(path.join(path.dirname(appRoot), "Support Files", "Plug-ins"));
    }
    candidates = unique(candidates.filter(Boolean));
    for (var index = 0; index < candidates.length; index += 1) {
      if (fs.existsSync(candidates[index])) return candidates[index];
    }
    return candidates[0] || "";
  }

  function runningAePluginRoots() {
    if (runningAePluginRootsCache) return runningAePluginRootsCache;
    runningAePluginRootsCache = [];
    if (!childProcess || os.platform() !== "win32") return runningAePluginRootsCache;
    try {
      var output = childProcess.execFileSync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Get-Process -Name AfterFX -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path"
      ], { encoding: "utf8", timeout: 5000 });
      output.split(/\r?\n/).forEach(function (line) {
        var exePath = line.trim();
        if (!exePath) return;
        var supportDir = path.dirname(exePath);
        runningAePluginRootsCache.push(path.join(supportDir, "Plug-ins"));
        runningAePluginRootsCache.push(path.join(path.dirname(supportDir), "Plug-ins"));
      });
      runningAePluginRootsCache = unique(runningAePluginRootsCache);
    } catch (error) {
      runningAePluginRootsCache = [];
    }
    return runningAePluginRootsCache;
  }

  function discoverAePluginRoots(preferCurrentAe) {
    var roots = [];
    var aeYear = currentAeYear();
    var baseDirs = [
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Adobe"),
      process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "Adobe") : ""
    ].filter(Boolean);
    baseDirs.forEach(function (baseDir) {
      safeReaddir(baseDir).forEach(function (entry) {
        if (!/^Adobe After Effects/i.test(entry)) return;
        if (preferCurrentAe && aeYear && entry.indexOf(aeYear) === -1) return;
        var appDir = path.join(baseDir, entry);
        roots.push(path.join(appDir, "Support Files", "Plug-ins"));
        roots.push(path.join(appDir, "Plug-ins"));
      });
    });
    return roots;
  }

  function currentAeYear() {
    var major = parseInt(((cs.getHostEnvironment().appVersion || "").split(".")[0] || ""), 10);
    if (!major || major < 10) return "";
    return major >= 2000 ? String(major) : String(2000 + major);
  }

  function isExtensionPath(targetPath) {
    return /[\\\/]Adobe[\\\/]CEP[\\\/]extensions[\\\/]SuperPluginCenter/i.test(String(targetPath || ""));
  }

  function defaultTargetDir(kind, roots, plugin) {
    if (roots.mode === "custom" && roots.custom) return roots.custom;
    if (kind === "cep") return roots.cepExtensions;
    if (kind === "script") return roots.userScripts;
    if (kind === "preset") return roots.userPresets;
    if (kind === "native") {
      if (roots.mode === "common") return path.join(roots.commonPlugins, plugin.name);
      if (roots.mode === "app" && roots.appPlugins) return path.join(roots.appPlugins, plugin.name);
      return path.join(roots.userData, "Adobe", "After Effects", "Plug-ins", plugin.name);
    }
    return roots.custom || path.join(roots.userData, "ZJIAN", "SuperPluginCenter", "Installed", plugin.name);
  }

  function expandTarget(target, roots) {
    return normalizePath(target)
      .replace("{userData}", roots.userData)
      .replace("{documents}", roots.documents)
      .replace("{commonPlugins}", roots.commonPlugins)
      .replace("{appPlugins}", roots.appPlugins)
      .replace("{cepExtensions}", roots.cepExtensions)
      .replace("{userScripts}", roots.userScripts)
      .replace("{userPresets}", roots.userPresets)
      .replace("{custom}", roots.custom || "");
  }

  function recordInstalled(plugin, plan) {
    state.installed[plugin.id] = {
      name: plugin.name,
      version: plugin.version || "",
      type: plugin.type || "",
      sourcePath: plugin.sourcePath || "",
      installedAt: new Date().toISOString(),
      paths: plan.map(function (item) { return item.targetPath; }),
      targetDirs: unique(plan.map(function (item) { return item.targetDir; }))
    };
    saveConfig();
  }

  function installedStatus(plugin) {
    var record = state.installed[plugin.id];
    if (!record) {
      record = inferExistingInstall(plugin);
      if (record) {
        state.installed[plugin.id] = record;
        saveConfig();
      }
    }
    if (!record || !record.paths || !record.paths.length) {
      return { installed: false, updateAvailable: false, record: null };
    }
    var existing = record.paths.filter(function (targetPath) {
      return targetPath && fs.existsSync(targetPath) && !isExtensionPath(targetPath) && isPathForCurrentAe(targetPath);
    });
    if (!existing.length) {
      var inferred = inferExistingInstall(plugin);
      if (inferred) {
        state.installed[plugin.id] = inferred;
        saveConfig();
        return {
          installed: true,
          updateAvailable: compareVersions(plugin.version, inferred.version) > 0,
          record: inferred
        };
      }
      delete state.installed[plugin.id];
      saveConfig();
      return { installed: false, updateAvailable: false, record: record };
    }
    return {
      installed: true,
      updateAvailable: compareVersions(plugin.version, record.version) > 0,
      record: record
    };
  }

  function allVersionsStatus(plugin) {
    var paths = [];
    var record = state.installed[plugin.id];
    if (record && record.paths) {
      paths = paths.concat(record.paths.filter(function (targetPath) {
        return targetPath && fs.existsSync(targetPath) && !isExtensionPath(targetPath);
      }));
    }
    if (plugin.remote && plugin.remote.fileName && inferKindFromName(plugin.remote.fileName) === "native") {
      paths = paths.concat(findAllNativeTargets(plugin.remote.fileName, targetRoots("app")));
    }
    paths = unique(paths).filter(function (targetPath) {
      return targetPath && fs.existsSync(targetPath);
    });
    if (!paths.length) {
      return { installed: false, updateAvailable: false, record: null };
    }
    return {
      installed: true,
      updateAvailable: false,
      record: {
        name: plugin.name,
        version: plugin.version || "",
        type: plugin.type || "",
        sourcePath: plugin.sourcePath || "",
        installedAt: new Date().toISOString(),
        paths: paths,
        targetDirs: unique(paths.map(function (item) { return path.dirname(item); })),
        allVersions: true
      }
    };
  }

  function isPathForCurrentAe(targetPath) {
    var aeYear = currentAeYear();
    if (!aeYear) return true;
    var match = String(targetPath || "").match(/Adobe After Effects\s+(\d{4})/i);
    return !match || match[1] === aeYear;
  }

  function inferExistingInstall(plugin) {
    if (!plugin.remote || !plugin.remote.fileName) return null;
    var fileName = plugin.remote.fileName;
    var kind = inferKindFromName(fileName);
    if (kind !== "native") return null;
    var modes = ["app", "user", "common"];
    var found = [];
    for (var index = 0; index < modes.length; index += 1) {
      var roots = targetRoots(modes[index]);
      var targetDir = defaultTargetDir(kind, roots, plugin);
      var targetPath = path.join(targetDir, fileName);
      if (fs.existsSync(targetPath)) {
        found.push(targetPath);
      }
      found = found.concat(findExistingNativeTargets(fileName, roots, false));
    }
    found = unique(found);
    if (found.length) {
      return {
        name: plugin.name,
        version: plugin.version || "",
        type: plugin.type || "",
        sourcePath: plugin.sourcePath || "",
        installedAt: new Date().toISOString(),
        paths: found,
        targetDirs: unique(found.map(function (item) { return path.dirname(item); })),
        detected: true
      };
    }
    return null;
  }

  function findExistingNativeTargets(fileName, roots, includeOtherAeVersions) {
    if (!fileName) return [];
    var primaryCandidates = [
      roots.appPlugins,
      path.join(roots.userData, "Adobe", "After Effects", "Plug-ins"),
      roots.commonPlugins
    ].concat(runningAePluginRoots()).concat(discoverAePluginRoots(true)).filter(Boolean);
    var found = findFilesInRoots(primaryCandidates, fileName);
    if (found.length || includeOtherAeVersions === false) return found;
    return findFilesInRoots(discoverAePluginRoots(false), fileName);
  }

  function findAllNativeTargets(fileName, roots) {
    if (!fileName) return [];
    var candidates = [
      roots.appPlugins,
      path.join(roots.userData, "Adobe", "After Effects", "Plug-ins"),
      roots.commonPlugins
    ].concat(runningAePluginRoots()).concat(discoverAePluginRoots(true)).concat(discoverAePluginRoots(false)).filter(Boolean);
    return findFilesInRoots(candidates, fileName);
  }

  function findFilesInRoots(candidates, fileName) {
    var found = [];
    candidates.forEach(function (root) {
      found = found.concat(findFilesByName(root, fileName, 4));
    });
    return unique(found);
  }

  function findFilesByName(root, fileName, depth) {
    if (!root || depth < 0 || !fs.existsSync(root)) return [];
    var found = [];
    safeReaddir(root).forEach(function (entry) {
      var full = path.join(root, entry);
      try {
        var stat = fs.statSync(full);
        if (stat.isDirectory()) {
          found = found.concat(findFilesByName(full, fileName, depth - 1));
        } else if (entry.toLowerCase() === fileName.toLowerCase()) {
          found.push(full);
        }
      } catch (error) {
        // 无权限或被占用时跳过。
      }
    });
    return found;
  }

  function selectedPlugin() {
    return state.plugins.filter(function (plugin) { return plugin.id === state.selectedId; })[0] || state.plugins[0] || null;
  }

  function upsertPlugin(plugin) {
    var existing = state.plugins.filter(function (item) { return item.id === plugin.id; })[0];
    if (existing) {
      Object.keys(plugin).forEach(function (key) {
        existing[key] = plugin[key];
      });
    } else {
      state.plugins.push(plugin);
    }
    if (!state.selectedId) state.selectedId = plugin.id;
  }

  function loadConfig() {
    if (!fs.existsSync(state.configPath)) return;
    try {
      var config = readJson(state.configPath);
      state.repoPath = config.repoPath || "";
      state.selectedId = config.selectedId || "";
      state.customTarget = config.customTarget || "";
      state.sourceMode = "auto";
      state.installed = config.installed || {};
      if (els.sourceMode) els.sourceMode.value = state.sourceMode;
    } catch (error) {
      log("配置读取失败：" + error.message, true);
    }
  }

  function saveConfig() {
    ensureDir(path.dirname(state.configPath));
    fs.writeFileSync(state.configPath, JSON.stringify({
      repoPath: state.repoPath,
      selectedId: state.selectedId,
      customTarget: state.customTarget,
      sourceMode: "auto",
      installed: state.installed
    }, null, 2), "utf8");
  }

  function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  }

  function walk(root, visitor) {
    safeReaddir(root).forEach(function (entry) {
      if (isHidden(entry)) return;
      var full = path.join(root, entry);
      var stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".git") return;
        if (fs.existsSync(path.join(full, "CSXS", "manifest.xml"))) {
          visitor(full);
          return;
        }
        walk(full, visitor);
      } else {
        visitor(full);
      }
    });
  }

  function copyAny(source, target) {
    var stat = fs.statSync(source);
    if (stat.isDirectory()) {
      copyDir(source, target);
    } else {
      ensureDir(path.dirname(target));
      fs.copyFileSync(source, target);
    }
  }

  function copyDir(source, target) {
    ensureDir(target);
    safeReaddir(source).forEach(function (entry) {
      copyAny(path.join(source, entry), path.join(target, entry));
    });
  }

  function copyAnyElevated(source, target) {
    var inner = "$src = " + psQuote(source) + "; $dst = " + psQuote(target) + "; $parent = Split-Path -Parent $dst; if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }; Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force";
    var encoded = Buffer.from(inner, "utf16le").toString("base64");
    var launcher = "Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','" + encoded + "')";
    childProcess.execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      launcher
    ], { timeout: 180000 });
    if (!fs.existsSync(target)) {
      throw new Error("管理员安装后没有找到目标文件，可能取消了 UAC 或目标被占用。");
    }
  }

  function removeAny(targetPath) {
    if (!targetPath || !fs.existsSync(targetPath)) return "missing";
    try {
      removeAnyNormal(targetPath);
      return "deleted";
    } catch (error) {
      if (isAccessError(error) && os.platform() === "win32") {
        log("需要管理员权限删除：" + targetPath);
        return removeAnyElevated(targetPath);
      }
      throw error;
    }
  }

  function removeAnyNormal(targetPath) {
    var stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      safeReaddir(targetPath).forEach(function (entry) {
        removeAnyNormal(path.join(targetPath, entry));
      });
      fs.rmdirSync(targetPath);
    } else {
      fs.unlinkSync(targetPath);
    }
  }

  function removeAnyElevated(targetPath) {
    var inner = "$target = " + psQuote(targetPath) + "; while (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 1 }; if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }";
    var encoded = Buffer.from(inner, "utf16le").toString("base64");
    var launcher = "Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','" + encoded + "')";
    childProcess.execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      launcher
    ], { timeout: 180000 });
    return "scheduled";
  }

  function isAccessError(error) {
    return error && (error.code === "EPERM" || error.code === "EACCES");
  }

  function psQuote(value) {
    return "'" + String(value || "").replace(/'/g, "''") + "'";
  }

  function cleanupEmptyDirs(dirs) {
    dirs.forEach(function (dir) {
      try {
        if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory() && !safeReaddir(dir).length) {
          fs.rmdirSync(dir);
        }
      } catch (error) {
        // 目录不为空或无权限时保留。
      }
    });
  }

  function ensureDir(dir) {
    if (!dir) return;
    dir = fromCepPath(dir);
    if (fs.existsSync(dir)) return;
    var parent = path.dirname(dir);
    if (parent && parent !== dir) ensureDir(parent);
    try {
      fs.mkdirSync(dir);
    } catch (error) {
      if (!fs.existsSync(dir)) throw error;
    }
  }

  function safeReaddir(dir) {
    try {
      return fs.readdirSync(dir);
    } catch (error) {
      return [];
    }
  }

  function revealPath(targetPath) {
    if (!targetPath) return;
    var command = os.platform() === "win32"
      ? "explorer.exe " + JSON.stringify(fs.existsSync(targetPath) && fs.statSync(targetPath).isFile() ? "/select," + targetPath : targetPath)
      : "open " + JSON.stringify(targetPath);
    childProcess.exec(command);
  }

  function extractZip(zipPath) {
    var extractRoot = path.join(path.dirname(state.configPath), "Packages", path.basename(zipPath, ".zip"));
    try {
      ensureDir(extractRoot);
      childProcess.execFileSync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
        zipPath,
        extractRoot
      ]);
      log("已解压安装包：" + extractRoot);
      return extractRoot;
    } catch (error) {
      log("zip 解压失败：" + error.message, true);
      return "";
    }
  }

  function log(message, isError) {
    if (els.quickStatus) {
      els.quickStatus.textContent = (isError ? "⚠ " : "") + String(message).split("\n")[0];
      els.quickStatus.style.color = isError ? "#f0b45b" : "";
    }
    if (!els.log) return;
    var prefix = isError ? "⚠ " : "• ";
    els.log.textContent = prefix + message + "\n" + els.log.textContent;
  }

  function normalizePath(value) {
    return String(value || "").replace(/\\/g, path.sep).replace(/\//g, path.sep);
  }

  function fromCepPath(value) {
    value = String(value || "");
    if (!value) return "";
    if (/^file:/i.test(value)) {
      value = decodeURIComponent(value).replace(/^file:/i, "");
      value = value.replace(/^[\\/]+([A-Za-z]:)/, "$1");
      value = value.replace(/^[\\/]+/, "");
    }
    return normalizePath(value);
  }

  function isHidden(name) {
    return /^\./.test(name);
  }

  function unique(list) {
    var seen = {};
    return list.filter(function (item) {
      if (seen[item]) return false;
      seen[item] = true;
      return true;
    });
  }

  function slug(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function compareVersions(a, b) {
    var left = String(a || "").match(/\d+/g) || [];
    var right = String(b || "").match(/\d+/g) || [];
    var length = Math.max(left.length, right.length);
    for (var index = 0; index < length; index += 1) {
      var x = parseInt(left[index] || "0", 10);
      var y = parseInt(right[index] || "0", 10);
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  function labelKind(kind) {
    return {
      native: "原生插件",
      cep: "CEP 面板",
      script: "脚本面板",
      preset: "预设"
    }[kind] || kind || "未知";
  }

  function inferKindFromName(fileName) {
    var ext = path.extname(fileName || "").toLowerCase();
    if (ext === ".aex" || ext === ".plugin") return "native";
    if (ext === ".jsx" || ext === ".jsxbin") return "script";
    if (ext === ".ffx") return "preset";
    if (ext === ".zip") return "package";
    return "unknown";
  }
})();
