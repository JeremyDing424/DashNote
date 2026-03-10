// 点击图标直接打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  // 立即打开侧边栏，必须在用户手势的同步响应中调用
  chrome.sidePanel.open({
    tabId: tab.id
  });
});