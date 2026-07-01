/*
 * Minimal CSInterface bridge for this panel.
 * Adobe's full CSInterface.js can replace this file if you need advanced CEP APIs.
 */
(function () {
  "use strict";

  function CSInterface() {}

  CSInterface.prototype.evalScript = function (script, callback) {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.evalScript === "function") {
      window.__adobe_cep__.evalScript(script, callback || function () {});
      return;
    }
    if (callback) callback("");
  };

  CSInterface.prototype.getSystemPath = function (pathType) {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.getSystemPath === "function") {
      return window.__adobe_cep__.getSystemPath(pathType);
    }
    return "";
  };

  CSInterface.prototype.getHostEnvironment = function () {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.getHostEnvironment === "function") {
      try {
        return JSON.parse(window.__adobe_cep__.getHostEnvironment());
      } catch (error) {
        return {};
      }
    }
    return {};
  };

  window.CSInterface = CSInterface;
  window.SystemPath = {
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    APPLICATION: "application",
    EXTENSION: "extension"
  };
})();
