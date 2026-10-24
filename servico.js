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

// ---- rotina automatica ------------------------------------------------------ #
// Nos horarios da rotina (rotina.js), abre as rotas no Kayak UMA POR VEZ numa
// aba em segundo plano, espera o coletor gravar a linha no historico, fecha a
// aba e segue. Sem disfarce: se o site pedir verificacao de robo, a rodada para
// e avisa. A rodada e uma maquina de estados no storage ("rodada"), avancada
// por alarmes e pela gravacao do historico — o service worker do MV3 morre
// parado, entao nada pode depender de um setTimeout longo.
try { importScripts("analise.js", "historico.js", "rotina.js"); } catch (e) { /* rotina fica indisponivel */ }

const ALARME_PASSO = "rotina-passo";
const MAX_RODADAS = 90;   // ~1 mes de 3 rodadas/dia

async function lerRotina() {
  const { rotina } = await chrome.storage.local.get("rotina");
  return ROTINA.config(rotina);
}

// Um alarme diario por horario ("rodada-9", "rodada-15"...), refeito sempre
// que a config muda e quando o Chrome abre.
async function agendaRodadas() {
  if (typeof ROTINA === "undefined") return;
  const c = await lerRotina();
  for (const a of await chrome.alarms.getAll())
    if (a.name.startsWith("rodada-")) await chrome.alarms.clear(a.name);
  if (!c.ativa) return;
  const agora = new Date();
  for (const h of c.horarios)
    chrome.alarms.create(`rodada-${h}`, { when: ROTINA.proximo(h, agora).getTime(), periodInMinutes: 24 * 60 });
}

chrome.runtime.onInstalled.addListener(() => { agendaRodadas().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { agendaRodadas().catch(() => {}); });

async function iniciaRodada(horario, origem) {
  const { rodada } = await chrome.storage.local.get("rodada");
  // uma por vez; uma rodada "presa" ha mais de 1h e descartada
  if (rodada && !rodada.fim && Date.now() - rodada.inicio < 60 * 60 * 1000)
    return { ok: false, erro: "já existe uma rodada em andamento" };
  const c = await lerRotina();
  if (!c.rotas.length) return { ok: false, erro: "nenhuma rota configurada" };
  const agora = new Date();
  // rodada manual leva a hora no nome: duas no mesmo dia nao se confundem
  const rotulo = horario && horario !== "manual" ? horario
    : `manual ${String(agora.getHours()).padStart(2, "0")}h${String(agora.getMinutes()).padStart(2, "0")}`;
  const nova = {
    id: `${ROTINA.isoLocal(agora)} ${rotulo}`,
    horario: rotulo, origem, inicio: agora.getTime(),
    fila: ROTINA.fila(c, agora), indice: 0, proximo_em: 0,
    espaco_s: c.espaco_s, limite_s: c.limite_s,
  };
  await chrome.storage.local.set({ rodada: nova });
  agendaPasso(0);
  return { ok: true, id: nova.id };
}

const agendaPasso = (seg) => chrome.alarms.create(ALARME_PASSO, { when: Date.now() + Math.max(1, seg) * 1000 });

let andando = false;   // evita dois passos ao mesmo tempo (alarme + storage)
async function passo() {
  if (andando || typeof ROTINA === "undefined") return;
  andando = true;
  try {
    const { rodada } = await chrome.storage.local.get("rodada");
    if (!rodada || rodada.fim) return;
    const it = rodada.fila[rodada.indice];
    if (!it) return await finaliza(rodada);
    const agora = Date.now();

    if (it.status === "pendente") {
      if (agora < rodada.proximo_em) return agendaPasso((rodada.proximo_em - agora) / 1000);
      const aba = await chrome.tabs.create({ url: it.url, active: false });
      Object.assign(it, { status: "aberta", tabId: aba.id, aberta_em: agora });
      await chrome.storage.local.set({ rodada });
      return agendaPasso(30);
    }

    if (it.status === "aberta") {
      // 1) a linha desta rota ja foi gravada?
      const linhas = HIST.deStorage(await chrome.storage.local.get(null));
      const linha = linhas.slice().reverse().find((l) => ROTINA.casa(l, it));
      if (linha) {
        const { chave, ...dados } = linha;
        await chrome.storage.local.set({ [chave]: Object.assign(dados, { origem: "rotina", rodada: rodada.id }) });
        return await proxima(rodada, it, "ok", chave);
      }
      // 2) o site pediu verificacao de robo? para tudo, nao contorna
      let aba = null;
      try { aba = await chrome.tabs.get(it.tabId); } catch (e) { /* aba fechada */ }
      if (aba && ROTINA.bloqueio(aba.url || aba.pendingUrl, aba.title)) {
        it.status = "bloqueio";
        await fechaAba(it.tabId);
        for (const resto of rodada.fila) if (resto.status === "pendente") resto.status = "cancelada";
        return await finaliza(rodada);
      }
      // 3) estourou o tempo (ou a aba foi fechada)?
      if (!aba || agora - it.aberta_em > rodada.limite_s * 1000) return await proxima(rodada, it, aba ? "sem_dados" : "aba_fechada");
      return agendaPasso(30);
    }
    // estado inesperado: segue para a proxima
    return await proxima(rodada, it, it.status);
  } catch (e) {
    agendaPasso(60);
  } finally {
    andando = false;
  }
}

async function fechaAba(id) { try { await chrome.tabs.remove(id); } catch (e) { /* ja fechada */ } }

async function proxima(rodada, it, status, chave) {
  it.status = status;
  if (chave) it.chave = chave;
  await fechaAba(it.tabId);
  rodada.indice += 1;
  rodada.proximo_em = Date.now() + rodada.espaco_s * 1000;
  await chrome.storage.local.set({ rodada });
  if (rodada.indice >= rodada.fila.length) return await finaliza(rodada);
  agendaPasso(rodada.espaco_s);
}

async function finaliza(rodada) {
  if (rodada.fim) return;
  rodada.fim = Date.now();
  const linhas = HIST.deStorage(await chrome.storage.local.get(null));
  const r = ROTINA.resumo(rodada, linhas);
  rodada.resumo = { texto: r.texto, lidas: r.lidas, total: r.total, cvcMaisBarata: r.cvcMaisBarata,
                    comparaveis: r.comparaveis, semCvc: r.semCvc, bloqueada: r.bloqueada };
  const { rodadas } = await chrome.storage.local.get("rodadas");
  // nunca a mesma rodada duas vezes
  const lista = (rodadas || []).filter((r) => r.id !== rodada.id).concat([rodada]).slice(-MAX_RODADAS);
  await chrome.storage.local.set({ rodada, rodadas: lista });
  try {
    chrome.notifications.create(`rodada:${rodada.id}`, {
      type: "basic", iconUrl: "icones/icone128.png", priority: r.bloqueada ? 2 : 0,
      title: `Metabuscadores CVC — rodada ${rodada.horario}`, message: r.texto,
    });
  } catch (e) { /* notificacao e enfeite */ }
}

chrome.notifications && chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith("rodada:")) chrome.tabs.create({ url: chrome.runtime.getURL("relatorio.html") });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARME_PASSO) { passo(); return; }
  const m = /^rodada-(\d+)$/.exec(a.name);
  if (m) iniciaRodada(ROTINA.rotuloHorario(Number(m[1])), "agenda").catch(() => {});
});

// a linha do historico chegou: avanca na hora, sem esperar o alarme
chrome.storage.onChanged.addListener((mud, area) => {
  if (area !== "local") return;
  if (Object.keys(mud).some((k) => k.startsWith("hist:"))) passo();
  if (mud.rotina) agendaRodadas().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _rem, responde) => {
  if (!msg || typeof msg.tipo !== "string" || !msg.tipo.startsWith("rotina-")) return false;
  if (msg.tipo === "rotina-rodar") {
    iniciaRodada("manual", "botao").then(responde, (e) => responde({ ok: false, erro: String(e) }));
    return true;
  }
  if (msg.tipo === "rotina-proximas") {
    chrome.alarms.getAll().then((as) => responde(as.filter((a) => a.name.startsWith("rodada-"))
      .map((a) => a.scheduledTime).sort()));
    return true;
  }
  return false;
});
