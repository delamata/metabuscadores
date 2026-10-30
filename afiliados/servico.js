// Service worker do Afiliados: so abre o painel pelo icone e pinta o selo "AF"
// nas abas do Melhores Destinos. Nada aqui pode lancar na avaliacao (MV3).
try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} catch (e) { /* sem sidePanel */ }

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url) return;
  const md = /^https:\/\/(www\.)?melhoresdestinos\.com\.br\//.test(tab.url);
  try {
    chrome.action.setBadgeText({ tabId, text: md ? "AF" : "" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#0b2a6f" });
  } catch (e) { /* selo e enfeite */ }
});
