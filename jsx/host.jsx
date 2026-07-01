/* global app */
(function () {
  "use strict";

  $.global.superPluginCenter_postInstall = function (message) {
    try {
      if (message) {
        alert("超级插件管理中心\n\n" + message);
      }
      return "AE 已收到安装后提示。";
    } catch (error) {
      return "安装后脚本执行失败：" + error.toString();
    }
  };
})();
