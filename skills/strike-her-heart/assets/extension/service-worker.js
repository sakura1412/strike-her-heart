/* User activation grants access only to this tab. No host permissions or network. */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    // This local file is a no-op outside its exact, explicitly checked SGE URL.
    // Run it in the same isolated world before the shared runtime; it makes no requests.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["site-adapters/sge.js"]
    });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (!window.StrikeHerHeart) return false;
        window.StrikeHerHeart.scan();
        window.StrikeHerHeart.toggle();
        return true;
      }
    });
    if (!result?.result) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["overlay.js"]
      });
    }
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    await chrome.action.setTitle({ tabId: tab.id, title: "显示 / 隐藏 Strike Her Heart 标注" });
  } catch (error) {
    // Browser-internal pages and extension stores prohibit script injection.
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b45309" });
    await chrome.action.setTitle({
      tabId: tab.id,
      title: `此页无法加载标注。请打开普通网页后重试。${String(error.message || error).slice(0, 160)}`
    });
  }
});
