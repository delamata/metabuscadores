// Mundo ISOLADO: reconhece o site, junta os polls, fecha a busca, roda a analise e publica.
//
// Toda a inteligencia que era do ponte_kibana.py mora aqui agora — nao existe
// mais servidor local. O payload de 40 MB nunca sai da aba: so o resultado
// (alguns KB) vai para o service worker, que o guarda para o painel.
const AGENTE = "cvc_";
// Reconhece o site ao entrar (Skyscanner ou Kayak). O payload e o mesmo nos
// dois; o site so muda a leitura da rota na URL e o rotulo no painel.
const SITE = CVC.siteDaUrl(location.href);
const SITE_NOME = SITE ? CVC.SITES[SITE].nome : null;
const ESPERA = 120000;   // ate isto esperando um poll com status=complete
const CARENCIA = 12000;  // depois do complete, so isto (ofertas atrasadas)

let cfg = null, payloads = [], t0 = null, completou = false;
let prazo = 0, timer = null, fechando = false;
// a ultima analise pronta, para a batida periodica NAO publicar "vigiando" por
// cima dela: depois do fechamento cfg volta a ser nulo, e sem isto o resultado
// vivia 3 segundos na tela antes de ser apagado
let ultimoResultado = null;
const diag = { capturas: [], vistos: [], workers: [], sw: null, falhas: [] };

// O estado vai direto para chrome.storage.local, sem passar pelo service
// worker. Um content script tem acesso a chrome.storage, e o SW do MV3 morre
// por inatividade e pode falhar na avaliacao — com ele no caminho, um erro dele
// deixava o painel MUDO em vez de mostrar a analise. Agora ele so serve para a
// consulta ao log (unica coisa que so ele pode fazer, por causa do CORS).
function publica(dados) {
  const estado = Object.assign({ site: SITE, site_nome: SITE_NOME,
                                 diagnostico: resumoDiag() }, dados);
  try {
    chrome.storage.local.set({ estado }).catch(() => {});
  } catch (e) { /* extensao recarregada por baixo da aba */ }
}

function resumoDiag() {
  return {
    capturas: diag.capturas.slice(-12),
    vistos: diag.vistos.slice(-25),
    workers: diag.workers,
    sw: diag.sw,
    falhas: diag.falhas.slice(-5),
    total_capturas: diag.capturas.length,
    total_vistos: diag.vistos.length,
  };
}

// so o frame de cima publica batida: um iframe do site publicaria por cima.
// E so a aba VISIVEL: com Skyscanner e Kayak abertos ao mesmo tempo, as duas
// batidas se alternariam no painel a cada 3 segundos.
if (window.top === window && SITE) {
  avisaSite();
  publicaAgora();
  setInterval(() => { if (document.visibilityState === "visible") publicaAgora(); }, 3000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { avisaSite(); publicaAgora(); }
  });
}

// Selo no icone da extensao (SKY/KYK) para mostrar que o site foi reconhecido.
// Passa pelo service worker, mas e enfeite: se ele falhar, nada mais depende.
function avisaSite() {
  try {
    chrome.runtime.sendMessage({ tipo: "site", site: SITE }).catch(() => {});
  } catch (e) { /* extensao recarregada por baixo da aba */ }
}

window.addEventListener("message", (ev) => {
  const d = ev.data;
  if (!SITE || !d || !d.__capturaCVC || ev.source !== window) return;

  if (d.tipo === "visto") {
    const curto = d.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 90);
    diag.vistos.push({ m: d.metodo, url: curto, st: d.status, o: d.origem,
                       bytes: d.bytes || 0, nota: d.nota,
                       t: new Date().toLocaleTimeString("pt-BR") });
    publicaAgora();
    return;
  }
  if (d.tipo === "worker") { diag.workers.push(d.url); publicaAgora(); return; }
  if (d.tipo === "sw") { diag.sw = d.escopos; publicaAgora(); return; }
  if (d.tipo === "falha") { diag.falhas.push({ url: d.url, erro: d.erro }); publicaAgora(); return; }
  if (d.tipo !== "vitrine") return;

  let payload;
  try { payload = JSON.parse(d.corpo); } catch (e) { return; }
  // o gancho filtra por conter "itineraries" no texto; aqui confirmamos que e
  // mesmo o objeto que a analise consome, e nao a palavra solta noutro lugar
  if (!payload || typeof payload.itineraries !== "object" || !payload.itineraries) {
    diag.vistos.push({ m: d.metodo, url: (d.url || "").slice(-60), st: d.status,
                       o: d.origem, bytes: d.corpo.length, nota: "sem objeto itineraries",
                       t: new Date().toLocaleTimeString("pt-BR") });
    publicaAgora();
    return;
  }
  recebe(payload, d.t0, d.corpo.length, d.url, d.metodo);
});

function recebe(payload, quando, bytes, url, metodo) {
  const novo = CVC.cfgDaUrl(location.href);
  if (!novo) return;
  const [rota] = CVC.canoniza(novo, CVC.indiceDePlaces(payload));

  if (cfg && JSON.stringify(rota) !== JSON.stringify(cfg)) fecha();   // rota trocou
  if (!cfg) { cfg = rota; t0 = quando; prazo = Date.now() + ESPERA; }

  payloads.push(payload);
  const it = payload.itineraries || {};
  const status = (it.context || {}).status;
  if (status === "complete") completou = true;
  diag.capturas.push({ bytes, status, itin: (it.results || []).length,
                       m: metodo, url: String(url || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 70),
                       t: new Date().toLocaleTimeString("pt-BR") });
  console.log(`[captura CVC/${SITE_NOME}] poll ${payloads.length}: ${(bytes / 1e6).toFixed(1)} MB, `
    + `${(it.results || []).length} itinerarios, status=${status}`);
  publica(estadoColetando());
  reagenda();
}

// O painel precisa saber que o coletor ESTA VIVO mesmo sem captura nenhuma —
// senao "nada aparece" tem duas causas indistinguiveis: content script que nao
// carregou e gancho que nao viu nada. Estados diferentes separam as duas.
function estadoVigiando() {
  // sem payload ainda nao ha indice de places; canoniza com indice vazio so
  // aplica o palpite (SAOA -> SAO), que ja e o que o painel deve mostrar
  const bruta = CVC.cfgDaUrl(location.href);
  return { estado: "vigiando", url: location.href.slice(0, 200),
           rota: bruta ? CVC.canoniza(bruta, {})[0] : null,
           frame: window.top === window };
}

function publicaAgora() {
  if (cfg) return publica(estadoColetando());
  if (ultimoResultado) return publica(ultimoResultado);
  publica(estadoVigiando());
}

function estadoColetando() {
  const ultimo = payloads[payloads.length - 1] || {};
  return { estado: "coletando", cfg, polls: payloads.length, completou,
           status_poll: ((ultimo.itineraries || {}).context || {}).status,
           carencia: Math.round(CARENCIA / 1000),
           resta: Math.max(0, Math.round((prazo - Date.now()) / 1000)) };
}

// Mesma regra do robo: enquanto nenhum poll trouxer status=complete, espera ate
// ESPERA contados do primeiro poll (o intervalo entre polls do Skyscanner passa
// facil de 12s); depois do complete, so a carencia.
function reagenda() {
  clearTimeout(timer);
  const atraso = completou ? CARENCIA : Math.max(2000, prazo - Date.now());
  timer = setTimeout(fecha, atraso);
}

async function fecha() {
  if (fechando || !payloads.length) return;
  fechando = true;
  clearTimeout(timer);
  const meuCfg = cfg, meusPayloads = payloads, meuT0 = t0, meuCompletou = completou;
  cfg = null; payloads = []; t0 = null; completou = false;

  const res = CVC.contaPorCia(meusPayloads, AGENTE);
  res.posicoes = CVC.posicoesDoAgente(meusPayloads, AGENTE);

  const routes = CVC.rotasDoLog(meuCfg.origem, meuCfg.destino, meuCfg.ida, meuCfg.volta);
  const desde = new Date(meuT0 - 5000).toISOString().replace(/\.\d+Z$/, "Z");

  let log = { docs: 0, correlation_ids: [], por_correlation: {}, horarios: {} };
  let erroLog = null, precisaPermissao = false;
  try {
    const r = await chrome.runtime.sendMessage(
      { tipo: "log", query: CVC.consultaLogQuery(routes, desde) });
    if (r && r.ok) log = CVC.agrupaLog(r.dados);
    else {
      erroLog = (r && r.erro) || "sem resposta do service worker";
      precisaPermissao = !!(r && r.precisaPermissao);
    }
  } catch (e) {
    erroLog = String(e).slice(0, 200);
  }

  const usado = log.correlation_ids[0] || null;

  // Segunda consulta, no MESMO correlationId: as mensagens de falha. Fonte que
  // deu timeout nao loga duration, entao ela nao aparece nas metricas — sem esta
  // consulta a companhia dela sairia sem tempo (ou, pior, com o tempo de outra
  // fonte mapeada na mesma companhia).
  let falhas = {};
  if (usado && !erroLog) {
    try {
      const rm = await chrome.runtime.sendMessage(
        { tipo: "log", query: CVC.consultaMensagensQuery(usado) });
      if (rm && rm.ok) falhas = CVC.falhasDasMensagens(rm.dados);
    } catch (e) { /* sem as mensagens o tempo principal ainda vale */ }
  }

  const [porCia, outras, outrasTimeout] = CVC.temposPorCia(
    usado ? log.por_correlation[usado] : {}, CVC.FONTE_PARA_CIA, falhas);
  for (const linha of res.por_cia) {
    const r = porCia[linha.cia] || {};
    linha.tempo_ms = r.tempo_ms ?? null;
    linha.fonte = r.fonte ?? null;
    linha.timeout_ms = r.timeout_ms ?? null;
    linha.fonte_timeout = r.fonte_timeout ?? null;
  }

  ultimoResultado = {
    estado: "pronto",
    quando: new Date().toLocaleTimeString("pt-BR"),
    cfg: meuCfg,
    agente: AGENTE,
    agente_nome: res.agente_nome,
    polls: meusPayloads.length,
    total_itinerarios: res.total_itinerarios,
    itinerarios_do_agente: res.itinerarios_do_agente,
    busca_completou: meuCompletou,
    agente_participa_da_busca: res.agente_participa_da_busca,
    por_cia: res.por_cia,
    posicoes: res.posicoes,
    combinadas: res.combinadas,
    outras_fontes: outras,
    fontes_timeout: outrasTimeout,
    kibana: usado ? CVC.urlKibana(usado) : null,
    log: { routes, desde, docs: log.docs, correlation_ids: log.correlation_ids,
           usado, ambiguo: log.correlation_ids.length > 1, erro: erroLog,
           precisaPermissao, horarios: log.horarios,
           // quantas fontes responderam em cada correlationId: 15 por busca, e
           // e assim que se ve que N correlationIds = N buscas na janela
           fontes_por_cid: Object.fromEntries(log.correlation_ids.map(
             (c) => [c, Object.keys(log.por_correlation[c] || {}).length])) },
  };
  publica(ultimoResultado);
  console.log(`[captura CVC/${SITE_NOME}] analise publicada — abra o painel lateral`);
  fechando = false;
}
