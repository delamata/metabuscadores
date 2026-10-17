// Porte JS da analise que mora no Python. ATENCAO: isto e uma SEGUNDA
// implementacao das mesmas contas de robo_cia_skyscanner.py (conta_por_cia,
// posicoes_do_agente) e robo_cia_kibana.py (agrupa_log, tempos_por_cia,
// routes_do_log, FONTE_PARA_CIA). Foi o preco de tirar a ponte local: sem
// servidor Python, a conta tem que acontecer aqui. Se mexer em uma, mexa na
// outra — os numeros TEM que continuar iguais (ha um teste que compara os dois
// lados contra o mesmo payload: teste_analise.js; tests/ cobre o porte).
var CVC = (() => {
  const SEM_CIA = "(sem companhia identificada)";

  // parameters.source -> companhia.
  //
  // GOL e SGOL, e SO SGOL. GLL saiu do mapa: medido no correlationId
  // 8f022474 (2026-08-21), com SGOL em timeout, as fontes com duration eram
  // NLAT 4831, EAZL 3500, LAT 2776, FRT 228, GLL 10, AA 8, LHG 8, NEMI 8 — a
  // GOL aparecia com os 10 ms do GLL quando a verdade era "timeout em 6000ms".
  // Fonte errada com numero bonito e pior que fonte nenhuma.
  const FONTE_PARA_CIA = {
    SGOL: "GOL Linhas Aéreas",
    EAZL: "Azul", AZUL: "Azul",
    LAT: "LATAM Airlines", AA: "American Airlines",
  };

  const min = (a) => a.reduce((x, y) => (y < x ? y : x));

  function ciasDoItinerario(itin) {
    const nomes = [];
    for (const leg of itin.legs || []) {
      for (const m of (leg.carriers || {}).marketing || []) {
        const nome = m.name || m.alternateId || "?";
        if (!nomes.includes(nome)) nomes.push(nome);
      }
    }
    return nomes.length ? nomes : [SEM_CIA];
  }

  // Une os polls e conta itinerarios/precos por companhia. Chaveia por id do
  // itinerario para nao contar duas vezes o mesmo voo que aparece em N polls.
  function contaPorCia(payloads, agente) {
    const vistos = new Map();
    const agentesNomes = {};
    const status = [];

    for (const pl of payloads) {
      const it = pl.itineraries || {};
      status.push((it.context || {}).status);
      for (const a of it.agents || []) agentesNomes[a.id] = a.name || a.id;
      for (const r of it.results || []) {
        const rid = r.id;
        if (!rid) continue;
        const opcoes = (r.pricingOptions || []).filter((po) => (po.price || {}).amount);
        if (!opcoes.length) continue;
        const precosAg = opcoes.filter((po) => (po.agentIds || []).includes(agente))
                               .map((po) => po.price.amount);
        const geral = min(opcoes.map((po) => po.price.amount));
        let reg = vistos.get(rid);
        if (!reg) {
          reg = { cias: ciasDoItinerario(r), agente: null, geral };
          vistos.set(rid, reg);
        }
        reg.geral = Math.min(reg.geral, geral);
        if (precosAg.length) {
          const menor = min(precosAg);
          reg.agente = reg.agente === null ? menor : Math.min(reg.agente, menor);
        }
      }
    }

    const porCia = new Map();
    const combos = new Map();
    for (const reg of vistos.values()) {
      const tem = reg.agente !== null;
      if (tem && reg.cias.length > 1) {
        const k = reg.cias.join("+");
        combos.set(k, (combos.get(k) || 0) + 1);
      }
      for (const cia of reg.cias) {
        let d = porCia.get(cia);
        if (!d) {
          d = { cia, voos_agente: 0, voos_busca: 0, menor_agente: null, menor_busca: null };
          porCia.set(cia, d);
        }
        d.voos_busca += 1;
        if (d.menor_busca === null || reg.geral < d.menor_busca) d.menor_busca = reg.geral;
        if (tem) {
          d.voos_agente += 1;
          if (d.menor_agente === null || reg.agente < d.menor_agente) d.menor_agente = reg.agente;
        }
      }
    }

    const linhas = [...porCia.values()]
      .sort((a, b) => (b.voos_agente - a.voos_agente) || (b.voos_busca - a.voos_busca))
      .map((d) => ({
        ...d,
        cobertura: d.voos_busca ? d.voos_agente / d.voos_busca : 0,
        delta: (d.menor_agente !== null && d.menor_busca)
          ? (d.menor_agente - d.menor_busca) / d.menor_busca * 100 : null,
      }));

    const total = vistos.size;
    let doAgente = 0;
    for (const r of vistos.values()) if (r.agente !== null) doAgente += 1;
    return {
      agente,
      agente_nome: agentesNomes[agente] || agente,
      agente_participa_da_busca: agente in agentesNomes,
      busca_completou: status.includes("complete"),
      total_itinerarios: total,
      itinerarios_do_agente: doAgente,
      por_cia: linhas,
      combinadas: Object.fromEntries([...combos.entries()].sort((a, b) => b[1] - a[1])),
    };
  }

  // Usa UM payload — o mais completo — porque aqui a ordem importa: results vem
  // por score decrescente, que e a ordem "Recomendados" da tela. Unir polls
  // embaralharia isso.
  function posicoesDoAgente(payloads, agente) {
    const uteis = payloads.filter((pl) => ((pl.itineraries || {}).results || []).length);
    if (!uteis.length) return { posicoes: [], total: 0, primeira: null, no_topo: {} };
    const peso = (pl) => {
      const it = pl.itineraries || {};
      return [((it.context || {}).status === "complete") ? 1 : 0, (it.results || []).length];
    };
    const melhor = uteis.reduce((a, b) => {
      const [ca, na] = peso(a), [cb, nb] = peso(b);
      return (cb > ca || (cb === ca && nb > na)) ? b : a;
    });
    const resultados = (melhor.itineraries || {}).results || [];
    const posicoes = [];
    resultados.forEach((r, i) => {
      if ((r.pricingOptions || []).some((po) => (po.agentIds || []).includes(agente)))
        posicoes.push(i + 1);
    });
    const faixas = {};
    for (const n of [5, 10, 20, 50, 100])
      if (resultados.length >= n) faixas[n] = posicoes.filter((p) => p <= n).length;
    return { posicoes, total: resultados.length, primeira: posicoes[0] ?? null, no_topo: faixas };
  }

  // ---- log do ConectaAS ---------------------------------------------------- #
  function rotasDoLog(origem, destino, ida, volta) {
    let r = `${origem},${destino},${ida}`;
    if (volta) r += `+${destino},${origem},${volta}`;
    return r;
  }

  function consultaLogQuery(routes, desde, tamanho = 500) {
    return {
      size: tamanho,
      sort: [{ "@timestamp": "desc" }],
      _source: ["@timestamp", "correlationId", "operation", "duration", "routes",
                "parameters.source", "app_name"],
      query: { bool: { filter: [
        { match_phrase: { "operation.keyword": "metaSearch" } },
        { match_phrase: { routes } },
        { range: { "@timestamp": { gte: desde } } },
      ] } },
    };
  }

  // Cada fonte responde uma vez por busca: N documentos da mesma fonte = N
  // buscas distintas na janela, nao N tentativas da nossa.
  function agrupaLog(resposta) {
    const hits = (((resposta || {}).hits || {}).hits || []).map((h) => h._source || {});
    const buscas = new Map();
    const horarios = new Map();
    for (const h of hits) {
      const cid = h.correlationId || "(sem correlationId)";
      let fontes = ((h.parameters || {}).source) || [];
      if (typeof fontes === "string") fontes = [fontes];
      const ts = h["@timestamp"] || "";
      if (ts) horarios.set(cid, [...(horarios.get(cid) || []), ts]);
      if (!buscas.has(cid)) buscas.set(cid, new Map());
      for (const f of fontes) {
        if (h.duration == null) continue;
        const atual = buscas.get(cid).get(f) || 0;
        buscas.get(cid).set(f, Math.max(atual, h.duration));
      }
    }
    const ordem = [...buscas.keys()].sort((a, b) => {
      const ma = (horarios.get(a) || [""]).reduce((x, y) => (y > x ? y : x), "");
      const mb = (horarios.get(b) || [""]).reduce((x, y) => (y > x ? y : x), "");
      return mb.localeCompare(ma);
    });
    const porCorrelation = {};
    const janelas = {};
    for (const c of ordem) {
      porCorrelation[c] = Object.fromEntries(buscas.get(c));
      const hs = (horarios.get(c) || []).sort();
      if (hs.length) janelas[c] = [hs[0], hs[hs.length - 1]];
    }
    return { docs: hits.length, correlation_ids: ordem, por_correlation: porCorrelation,
             horarios: janelas };
  }

  // Mensagens de falha do mesmo correlationId. Estes documentos NAO tem campo
  // correlationId: o id vive dentro do texto ("CorrelationId: <uuid> GwAereo
  // consulting fail with source SGOL Detail: ... TimeoutException ... within
  // 6000ms"), e por isso o filtro e um match_phrase no proprio message — igual
  // ao que o Kibana faz.
  function consultaMensagensQuery(cid, tamanho = 100) {
    return {
      size: tamanho,
      sort: [{ "@timestamp": "asc" }],
      _source: ["@timestamp", "message", "app_name"],
      query: { bool: { filter: [{ match_phrase: { message: cid } }] } },
    };
  }

  const RE_FONTE_FALHA = /fail with source (\w+)/i;
  const RE_TIMEOUT = /within (\d+)\s*ms/i;

  function falhasDasMensagens(resposta) {
    const hits = (((resposta || {}).hits || {}).hits || []).map((h) => h._source || {});
    const falhas = {};
    for (const h of hits) {
      const msg = String(h.message || "");
      const mf = RE_FONTE_FALHA.exec(msg);
      if (!mf) continue;
      const fonte = mf[1].toUpperCase();
      const mt = RE_TIMEOUT.exec(msg);
      const reg = { timeout: !!mt, ms: mt ? Number(mt[1]) : null,
                    quando: h["@timestamp"] || null, texto: msg.slice(0, 300) };
      // varias falhas da mesma fonte: o timeout e a informacao mais especifica
      if (!falhas[fonte] || (reg.timeout && !falhas[fonte].timeout)) falhas[fonte] = reg;
    }
    return falhas;
  }

  // Junta duration e falha por companhia.
  //
  // Timeout NAO tem duration logada — e o motivo do cuidado aqui: se a
  // companhia tiver outra fonte mapeada que respondeu, o numero dela nao pode
  // se passar pelo tempo da companhia. Guardamos os dois lados (tempo_ms e
  // timeout_ms) e o painel mostra o timeout como manchete.
  function temposPorCia(fontes, mapa, falhas) {
    falhas = falhas || {};
    const porCia = {}, outras = {}, outrasTimeout = {};
    const pega = (cia) => (porCia[cia] = porCia[cia]
      || { tempo_ms: null, fonte: null, timeout_ms: null, fonte_timeout: null, fontes: [] });

    for (const [fonte, dur] of Object.entries(fontes || {})) {
      const cia = mapa[fonte.toUpperCase()];
      if (!cia) { outras[fonte] = dur; continue; }
      const reg = pega(cia);
      if (!reg.fontes.includes(fonte)) reg.fontes.push(fonte);
      if (reg.tempo_ms === null || dur > reg.tempo_ms) { reg.tempo_ms = dur; reg.fonte = fonte; }
    }

    for (const [fonte, f] of Object.entries(falhas)) {
      const cia = mapa[fonte.toUpperCase()];
      if (!cia) { if (f.timeout) outrasTimeout[fonte] = f.ms; continue; }
      const reg = pega(cia);
      if (!reg.fontes.includes(fonte)) reg.fontes.push(fonte);
      reg.timeout_ms = f.timeout ? f.ms : reg.timeout_ms;
      reg.fonte_timeout = fonte;
      reg.falha = f.texto;
    }

    const ordena = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
    return [porCia, ordena(outras), ordena(outrasTimeout)];
  }

  // A busca do Kibana que prova o timeout, para conferir na mao.
  const KIBANA_INDEX = "a2ee1550-052b-11f0-ae29-bd6c690d2dd4";

  function urlKibana(cid, janela = "now-24h") {
    const a = "(discover:(columns:!(message),isDirty:!f,sort:!()),"
      + `metadata:(indexPattern:${KIBANA_INDEX},view:discover))`;
    const g = `(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${janela},to:now))`;
    const q = "(filters:!(('$state':(store:appState),meta:(alias:!n,disabled:!f,"
      + `index:${KIBANA_INDEX},key:message,negate:!f,params:(query:${cid}),type:phrase),`
      + `query:(match_phrase:(message:${cid})))),query:(language:kuery,query:''))`;
    return "https://kibana.services.cvc.com.br/app/data-explorer/discover#"
      + `?_a=${a}&_g=${g}&_q=${q}`;
  }

  // ---- site ---------------------------------------------------------------- #
  // O plugin reconhece o site pelo host. Kayak devolve o mesmo payload
  // (itineraries/pricingOptions/agentIds) que o Skyscanner, entao a analise e
  // UMA so; o que muda por site e so o formato da rota na URL.
  const SITES = {
    skyscanner: { nome: "Skyscanner", host: /(^|\.)skyscanner\.(com\.br|net)$/i },
    kayak: { nome: "Kayak", host: /(^|\.)kayak\.com\.br$/i },
  };

  function siteDaUrl(href) {
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    for (const [id, s] of Object.entries(SITES)) if (s.host.test(u.hostname)) return id;
    return null;
  }

  // ---- rota da URL --------------------------------------------------------- #
  const RE_ROTA = /\/(?:transporte\/passagens-aereas|transport\/flights)\/([a-z0-9-]+)\/([a-z0-9-]+)\/(\d{6})(?:\/(\d{6}))?/i;

  function cfgSkyscanner(u) {
    const m = RE_ROTA.exec(u.pathname);
    if (!m) return null;
    const iso = (s) => `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
    const codigo = (c) => c.split("-")[0].toUpperCase();
    const adultos = parseInt(u.searchParams.get("adultsv2") || u.searchParams.get("adults") || "1", 10);
    return {
      origem: codigo(m[1]), destino: codigo(m[2]),
      ida: iso(m[3]), volta: m[4] ? iso(m[4]) : null,
      adultos: Number.isFinite(adultos) ? adultos : 1,
    };
  }

  // Kayak: /flights/SAO-RIO/2026-09-17/2026-09-24/2adults?sort=bestflight_a
  // Origem/destino podem vir com varios aeroportos ("GRU,CGH-RIO") e a data
  // com sufixo de flexibilidade ("2026-09-17-flexible-1day"). Com varios
  // aeroportos fica o primeiro: o log do ConectaAS tem uma rota so.
  const RE_ROTA_KAYAK = /\/flights\/([A-Z0-9,]+)(?:-nearby)?-([A-Z0-9,]+)(?:-nearby)?\/(\d{4}-\d{2}-\d{2})[^/]*(?:\/(\d{4}-\d{2}-\d{2})[^/]*)?/i;

  function cfgKayak(u) {
    const m = RE_ROTA_KAYAK.exec(u.pathname);
    if (!m) return null;
    const codigo = (c) => c.split(",")[0].toUpperCase();
    const ma = /\/(\d+)adults?\b/i.exec(u.pathname);
    const adultos = ma ? parseInt(ma[1], 10) : 1;
    return {
      origem: codigo(m[1]), destino: codigo(m[2]),
      ida: m[3], volta: m[4] || null,
      adultos: Number.isFinite(adultos) ? adultos : 1,
    };
  }

  function cfgDaUrl(href) {
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    const site = siteDaUrl(href);
    if (site === "kayak") return cfgKayak(u);
    if (site === "skyscanner") return cfgSkyscanner(u);
    return null;
  }

  // A URL usa o id da entidade ('saoa' = Sao Paulo, todos os aeroportos); o log
  // usa o codigo da cidade ('SAO'). O payload traz os dois lados em
  // segments[].origin.parent, entao a traducao sai do dado.
  function indiceDePlaces(payload, limite = 60) {
    const idx = {};
    const anota = (lugar) => {
      if (!lugar || typeof lugar !== "object") return;
      if (lugar.flightPlaceId && lugar.displayCode)
        idx[String(lugar.flightPlaceId).toUpperCase()] = String(lugar.displayCode).toUpperCase();
      anota(lugar.parent);
    };
    for (const r of ((payload.itineraries || {}).results || []).slice(0, limite))
      for (const leg of r.legs || [])
        for (const seg of leg.segments || []) { anota(seg.origin); anota(seg.destination); }
    return idx;
  }

  function canoniza(cfg, idx) {
    const fora = {};
    for (const campo of ["origem", "destino"]) {
      const c = cfg[campo];
      const novo = idx[c];
      if (novo && novo !== c) { cfg[campo] = novo; fora[campo] = `${c} -> ${novo}`; }
      else if (!novo && c.length === 4 && c.endsWith("A")) {
        cfg[campo] = c.slice(0, 3); fora[campo] = `${c} -> ${c.slice(0, 3)} (palpite)`;
      }
    }
    return [cfg, fora];
  }

  return { SEM_CIA, FONTE_PARA_CIA, ciasDoItinerario, contaPorCia, posicoesDoAgente,
           rotasDoLog, consultaLogQuery, agrupaLog, temposPorCia, cfgDaUrl,
           SITES, siteDaUrl,
           indiceDePlaces, canoniza, consultaMensagensQuery, falhasDasMensagens,
           urlKibana };
})();

if (typeof module !== "undefined") module.exports = CVC;   // para teste_analise.js
