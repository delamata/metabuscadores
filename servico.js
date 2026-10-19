// Service worker. So faz o que o content script nao pode: chamar o proxy
// Elasticsearch do ConectaAS (CORS) e pintar o selo do icone. NAO esta no
// caminho do estado — o coletor escreve direto em chrome.storage.local. Se este
// arquivo quebrar, perde-se a coluna de tempo por fonte, nao o painel.
//
// Nada aqui pode lancar na avaliacao: no MV3 um throw no topo derruba o worker
// inteiro, listeners inclusive.

// Endpoint _search do proxy ES (precisa de VPN). O padrao abaixo foi um
// palpite (o servico.js original nao veio junto) e deu HTTP 404; o endereco
// certo e configurado no painel e fica em chrome.storage.local "config.es_url".
// O host tem de estar em host_permissions ou optional_host_permissions.
const ES_URL_PADRAO = "https://api-java-soap-partnership.k8s-cvc.com.br/_search";
const TEMPO_MAX = 20000;

async function esUrl() {
  try {
    const { config } = await chrome.storage.local.get("config");
    if (config && config.es_url) return config.es_url;
  } catch (e) { /* cai no padrao */ }
  return ES_URL_PADRAO;
}

const SELOS = { skyscanner: ["SKY", "#0770e3"], kayak: ["KYK", "#ff690f"] };

try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} catch (e) { /* versao sem sidePanel: o painel ainda abre pelo menu */ }

async function consultaLog(query) {
  const ES_URL = await esUrl();
  let ES_ORIGEM;
  try { ES_ORIGEM = new URL(ES_URL).origin + "/*"; }
  catch (e) { return { ok: false, erro: `endereco do proxy ES invalido: ${ES_URL}`, url: ES_URL }; }
  let temPermissao = true;
  try {
    temPermissao = await chrome.permissions.contains({ origins: [ES_ORIGEM] });
  } catch (e) { /* segue e deixa o fetch responder */ }
  if (!temPermissao)
    return { ok: false, erro: `sem permissao para ${ES_ORIGEM}`, precisaPermissao: true,
             origem: ES_ORIGEM, url: ES_URL };

  const ctrl = new AbortController();
  const relogio = setTimeout(() => ctrl.abort(), TEMPO_MAX);
  try {
    const r = await fetch(ES_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      // o ES costuma dizer o motivo no corpo (index_not_found, no handler...)
      let motivo = "";
      try { motivo = (await r.text()).replace(/\s+/g, " ").slice(0, 300); } catch (e) { /* sem corpo */ }
      return { ok: false, erro: `HTTP ${r.status} no proxy ES`, detalhe: motivo, url: ES_URL };
    }
    return { ok: true, dados: await r.json() };
  } catch (e) {
    const erro = e && e.name === "AbortError"
      ? `proxy ES nao respondeu em ${TEMPO_MAX / 1000}s (VPN ligada?)`
      : `falha ao chamar o proxy ES: ${String(e).slice(0, 150)} (VPN ligada?)`;
    return { ok: false, erro, url: ES_URL };
  } finally {
    clearTimeout(relogio);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, responde) => {
  if (!msg) return false;

  if (msg.tipo === "log") {
    consultaLog(msg.query).then(responde,
      (e) => responde({ ok: false, erro: String(e).slice(0, 200) }));
    return true;   // resposta assincrona
  }

  if (msg.tipo === "site" && sender.tab && sender.tab.id != null) {
    const [texto, cor] = SELOS[msg.site] || ["", "#666"];
    try {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: texto });
      chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: cor });
    } catch (e) { /* selo e enfeite */ }
    return false;
  }

  return false;
});
