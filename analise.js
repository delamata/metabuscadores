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
  //
  // `rival` ({ nome, re }) e a agencia com quem a CVC e comparada (Decolar).
  // E localizada pelo nome OU pelo id do agente, porque cada site a chama de
  // um jeito (Skyscanner: id curto + nome; Kayak: codigo + displayName).
  function contaPorCia(payloads, agente, rival) {
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
          reg = { cias: ciasDoItinerario(r), agente: null, geral, precos: {}, maiores: {}, rival: null };
          vistos.set(rid, reg);
        }
        reg.geral = Math.min(reg.geral, geral);
        // menor preco de cada agencia neste voo; o rival sai daqui depois,
        // quando ja se conhece o nome de todos os agentes. Campo novo — nao
        // muda nenhum numero que ja existia (e ainda nao tem par no Python).
        for (const po of opcoes)
          for (const a of po.agentIds || []) {
            if (reg.precos[a] === undefined || po.price.amount < reg.precos[a])
              reg.precos[a] = po.price.amount;
            if (reg.maiores[a] === undefined || po.price.amount > reg.maiores[a])
              reg.maiores[a] = po.price.amount;
          }
        if (precosAg.length) {
          const menor = min(precosAg);
          reg.agente = reg.agente === null ? menor : Math.min(reg.agente, menor);
        }
      }
    }

    // ids do rival: todo agente cujo id ou nome bata com rival.re
    const idsRival = new Set();
    if (rival) {
      const todos = new Set(Object.keys(agentesNomes));
      for (const reg of vistos.values()) for (const a of Object.keys(reg.precos)) todos.add(a);
      for (const a of todos)
        if (a !== agente && (rival.re.test(a) || rival.re.test(agentesNomes[a] || ""))) idsRival.add(a);
    }
    const frente = { cvc: 0, rival: 0, empate: 0 };
    for (const reg of vistos.values()) {
      for (const a of idsRival)
        if (reg.precos[a] !== undefined && (reg.rival === null || reg.precos[a] < reg.rival))
          reg.rival = reg.precos[a];
      if (reg.agente !== null && reg.rival !== null) {
        if (reg.agente < reg.rival) frente.cvc += 1;
        else if (reg.agente > reg.rival) frente.rival += 1;
        else frente.empate += 1;
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
          d = { cia, voos_agente: 0, voos_busca: 0, menor_agente: null, menor_busca: null,
                voos_rival: 0, menor_rival: null };
          porCia.set(cia, d);
        }
        d.voos_busca += 1;
        if (reg.rival !== null) {
          d.voos_rival += 1;
          if (d.menor_rival === null || reg.rival < d.menor_rival) d.menor_rival = reg.rival;
        }
        if (d.menor_busca === null || reg.geral < d.menor_busca) d.menor_busca = reg.geral;
        if (tem) {
          d.voos_agente += 1;
          if (d.menor_agente === null || reg.agente < d.menor_agente) d.menor_agente = reg.agente;
        }
      }
    }

    // diferenca da CVC sobre o rival, em % do preco do rival:
    // positivo = CVC mais cara, negativo = CVC mais barata
    const dif = (cvc, riv) => (cvc !== null && riv) ? (cvc - riv) / riv * 100 : null;

    const linhas = [...porCia.values()]
      .sort((a, b) => (b.voos_agente - a.voos_agente) || (b.voos_busca - a.voos_busca))
      .map((d) => ({
        ...d,
        cobertura: d.voos_busca ? d.voos_agente / d.voos_busca : 0,
        delta: (d.menor_agente !== null && d.menor_busca)
          ? (d.menor_agente - d.menor_busca) / d.menor_busca * 100 : null,
        delta_rival: dif(d.menor_agente, d.menor_rival),
      }));

    let menorAgente = null, menorRival = null, doRival = 0;
    for (const r of vistos.values()) {
      if (r.agente !== null && (menorAgente === null || r.agente < menorAgente)) menorAgente = r.agente;
      if (r.rival !== null) {
        doRival += 1;
        if (menorRival === null || r.rival < menorRival) menorRival = r.rival;
      }
    }

    // Cada agencia da busca: em quantos voos tem oferta e o seu menor preco.
    // E o menor/maior preco da busca inteira, com quem ofereceu (empate soma).
    const porAgente = new Map();
    const menorGeral = { valor: null, ids: [] }, maiorGeral = { valor: null, ids: [] };
    const junta = (alvo, v, a, menor) => {
      if (alvo.valor === null || (menor ? v < alvo.valor : v > alvo.valor)) { alvo.valor = v; alvo.ids = [a]; }
      else if (v === alvo.valor && !alvo.ids.includes(a)) alvo.ids.push(a);
    };
    for (const reg of vistos.values()) {
      for (const [a, v] of Object.entries(reg.precos)) {
        const d = porAgente.get(a) || { id: a, nome: agentesNomes[a] || a, voos: 0, menor: null };
        d.voos += 1;
        if (d.menor === null || v < d.menor) d.menor = v;
        porAgente.set(a, d);
        junta(menorGeral, v, a, true);
      }
      for (const [a, v] of Object.entries(reg.maiores)) junta(maiorGeral, v, a, false);
    }
    const nomesDe = (ids) => ids.map((a) => ({ id: a, nome: agentesNomes[a] || a }));

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
      menor_agente: menorAgente,
      // CVC x rival (Decolar): menor preco de cada um na busca inteira
      rival: rival ? rival.nome : null,
      rival_nome: [...idsRival].map((a) => agentesNomes[a] || a)[0] || (rival ? rival.nome : null),
      rival_participa_da_busca: idsRival.size > 0,
      itinerarios_do_rival: doRival,
      menor_rival: menorRival,
      delta_rival: dif(menorAgente, menorRival),
      // nos voos que os dois vendem: em quantos cada um e mais barato
      frente_a_frente: frente,
      // todas as agencias, da que tem mais voos para a que tem menos
      por_agente: [...porAgente.values()].sort((x, y) => (y.voos - x.voos) || (x.menor - y.menor))
        .map((d) => ({ ...d, cobertura: total ? d.voos / total : 0 })),
      menor_geral: { valor: menorGeral.valor, agencias: nomesDe(menorGeral.ids) },
      maior_geral: { valor: maiorGeral.valor, agencias: nomesDe(maiorGeral.ids) },
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

  // ---- companhia aerea: nome do site -> nome do FONTE_PARA_CIA ------------- #
  // O Skyscanner chama de "GOL Linhas Aéreas"/"LATAM Airlines"; o Kayak de
  // "GOL"/"LATAM". Sem isto, no Kayak o tempo da fonte e o motivo de a CVC nao
  // ter retornado nunca achariam a companhia.
  const CIAS = [[/\bgol\b/i, "GOL Linhas Aéreas"], [/\bazul\b/i, "Azul"],
                [/\blatam\b/i, "LATAM Airlines"], [/\bamerican\b/i, "American Airlines"]];
  function ciaCanonica(nome) {
    const c = CIAS.find(([re]) => re.test(nome || ""));
    return c ? c[1] : nome;
  }
  const fontesDaCia = (cia) => Object.keys(FONTE_PARA_CIA).filter((f) => FONTE_PARA_CIA[f] === ciaCanonica(cia));

  // ---- por que a CVC nao retornou numa companhia ------------------------- #
  // So para companhia em que a CVC teve 0 voos. Usa o que a busca e o log do
  // ConectaAS dizem, do mais especifico para o mais generico. `ctx`:
  // { agenteParticipa, logErro, temBusca } (temBusca = achou o correlationId).
  const milhar = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  function motivoSemCvc(l, ctx) {
    if (!l || l.voos_agente > 0) return null;
    const c = ctx || {};
    if (c.agenteParticipa === false)
      return { codigo: "nao_participou", texto: "A CVC não participou desta busca (não está entre as agências do site)." };
    if (l.timeout_ms != null)
      return { codigo: "timeout", texto: `Fonte ${l.fonte_timeout} deu timeout em ${milhar(l.timeout_ms)} ms no ConectaAS — a oferta não chegou a tempo.` };
    if (l.fonte_timeout) {
      const det = l.falha ? `: ${String(l.falha).replace(/\s+/g, " ").slice(0, 140)}` : "";
      return { codigo: "falha", texto: `Fonte ${l.fonte_timeout} falhou no ConectaAS${det}` };
    }
    if (l.tempo_ms != null)
      return { codigo: "sem_oferta", texto: `Fonte ${l.fonte} respondeu em ${milhar(l.tempo_ms)} ms, mas a CVC não teve oferta para estes voos no site.` };
    if (c.logErro)
      return { codigo: "log_indisponivel", texto: `Motivo indisponível: log do ConectaAS não consultado (${String(c.logErro).slice(0, 80)}).` };
    if (!c.temBusca)
      return { codigo: "busca_fora_do_log", texto: "Motivo indisponível: esta busca não foi encontrada no log do ConectaAS." };
    const fontes = fontesDaCia(l.cia);
    if (!fontes.length)
      return { codigo: "sem_fonte", texto: "Nenhuma fonte do ConectaAS mapeada para esta companhia." };
    return { codigo: "nao_consultada", texto: `Fonte ${fontes.join("/")} não aparece no log desta busca — não foi consultada.` };
  }

  // ---- rotulos das agencias ---------------------------------------------- #
  // So a CVC aparece com o nome real. Cada concorrente vira "Player N", com
  // numero FIXO por agencia: o mesmo em qualquer busca, em qualquer
  // computador e no Excel. A Decolar e sempre o Player 1.
  //
  // AGENCIAS e o catalogo: `re` reconhece a agencia pelo nome/id, `numero` e
  // o Player, `cor` a classe CSS da marca (cores no painel.html), `antigo` o
  // sufixo usado ate a v0.14.0 ("Player - DCL"), para converter o historico.
  const AGENCIAS = [
    { re: /decolar/i, numero: 1, cor: "rival", antigo: "DCL" },
    { re: /zupper/i, numero: 2, cor: "tiffany", antigo: "ZPR" },
    { re: /max\s*milhas/i, numero: 3, cor: "maxmilhas", antigo: "MXM" },
    { re: /123\s*milhas/i, numero: 4, cor: "milhas123", antigo: "MLS" },
    { re: /vai\s*de\s*promo/i, numero: 5, antigo: "VDP" },
    { re: /\btrip\.com\b/i, numero: 6, antigo: "TRP" },
    { re: /viaja\s*net/i, numero: 7, antigo: "VJN" },
    { re: /booking/i, numero: 8, antigo: "BKN" },
    { re: /azul/i, numero: 9, cor: "azulcia", antigo: "ZLA" },
    { re: /\bgol\b|voegol/i, numero: 10, cor: "gol", antigo: "GLO" },
    { re: /latam/i, numero: 11, cor: "latam", antigo: "LTM" },
    { re: /gotogate/i, numero: 12, antigo: "GTG" },
    { re: /mytrip/i, numero: 13, antigo: "MYT" },
    { re: /kiwi/i, numero: 14, antigo: "KWC" },
    { re: /submarino/i, numero: 15, antigo: "SBM" },
    { re: /edreams/i, numero: 16, antigo: "DRM" },
    { re: /expedia/i, numero: 17, antigo: "XPD" },
    { re: /smiles/i, numero: 18, antigo: "SML" },
    { re: /passagens\s*promo/i, numero: 19, antigo: "PSG" },
    { re: /hurb/i, numero: 20, antigo: "RBU" },
    { re: /kissandfly/i, numero: 21, antigo: "KSN" },
    { re: /voopter/i, numero: 22, antigo: "VPT" },
    { re: /edestinos/i, numero: 23, antigo: "DST" },
  ];

  // Chave de uma agencia fora do catalogo no registro do navegador.
  const chaveAgencia = (nome) => String(nome || "").normalize("NFD").replace(/[^a-z0-9]/gi, "").toLowerCase();

  // Mapa id -> { rotulo, cor, numero } da busca. Agencia fora do catalogo
  // recebe o proximo numero livre e fica no `registro` ({ chave: numero }),
  // que o coletor guarda no navegador: dali em diante, sempre o mesmo numero.
  // O registro e alterado no lugar.
  function rotulosDaBusca(porAgente, agente, catalogo, registro) {
    const cat = catalogo || AGENCIAS, reg = registro || {};
    const mapa = new Map();
    let proximo = Math.max(0, ...cat.map((a) => a.numero || 0), ...Object.values(reg)) + 1;
    for (const ag of porAgente || []) {
      if (ag.id === agente) { mapa.set(ag.id, { rotulo: "CVC", cor: "cvc", numero: 0 }); continue; }
      const ap = cat.find((x) => x.re.test(ag.nome || "") || x.re.test(ag.id || "")) || {};
      let n = ap.numero;
      if (!n) {
        const k = chaveAgencia(ag.nome || ag.id);
        n = reg[k] || (reg[k] = proximo++);
      }
      mapa.set(ag.id, { rotulo: `Player ${n}`, cor: ap.cor || null, numero: n });
    }
    return mapa;
  }

  // Rotulo antigo ("Player - DCL" da v0.14.0, "Concorrente dcl" da v0.13.0)
  // -> rotulo atual ("Player 1"). Sufixo fora do catalogo fica como esta.
  const RE_ANTIGO = /\b(?:Player - |Concorrente (?!\+))([A-Za-z]{3})\b/g;
  function rotuloAtual(texto) {
    if (typeof texto !== "string") return texto;
    return texto.replace(RE_ANTIGO, (m, suf) => {
      const a = AGENCIAS.find((x) => x.antigo === suf.toUpperCase());
      return a ? `Player ${a.numero}` : m;
    });
  }
  const rotulaTodas = (lista, mapa) =>
    (lista || []).map((ag) => Object.assign({}, ag, mapa.get(ag.id) || { rotulo: ag.nome || ag.id, cor: null }));

  // ---- Kayak -> formato do Skyscanner -------------------------------------- #
  // O poll do Kayak (/i/api/search/dynamic/flights/poll) traz results[] com os
  // precos por agencia em bookingOptions e/ou optionsByFare[].options, cada um
  // com providerInfo {code, displayName} e displayPrice {price}. As companhias
  // vem por referencia: result.legs[].segments[].id -> segments{} -> airline ->
  // airlines{}. Traduzimos para itineraries/pricingOptions/agentIds para que a
  // analise continue UMA so. A CVC vira o agente "cvc_" pelo nome/codigo.
  //
  // Se o corpo nao tiver nada disto, devolve null — e o diagnostico registra
  // as chaves para o formato ser ajustado com dado real, nao com palpite.
  const RE_CVC = /\bcvc\b/i;
  const AGENTE_CVC = "cvc_";

  function precoKayak(op) {
    const cands = [op && op.displayPrice && op.displayPrice.price,
                   op && op.price && (op.price.price ?? op.price.amount ?? op.price),
                   op && op.fees && op.fees.rawPrice,
                   op && op.fees && op.fees.totalPrice];
    for (const c of cands) {
      const v = typeof c === "string" ? Number(c.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".")) : c;
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    }
    return null;
  }

  function agenteKayak(op, provedores) {
    const pi = (op && (op.providerInfo || op.provider)) || {};
    let code = pi.code || pi.providerCode || op.providerCode || pi.id || null;
    let nome = pi.displayName || pi.name || null;
    if (!nome && code && provedores[code]) nome = provedores[code].displayName || provedores[code].name;
    if (!code && !nome) return null;
    const id = (RE_CVC.test(nome || "") || RE_CVC.test(code || "")) ? AGENTE_CVC : String(code || nome);
    return { id, nome: nome || String(code) };
  }

  function ciasKayak(r, pl) {
    const segs = pl.segments || {}, cias = pl.airlines || {}, legsMap = pl.legs || {};
    const nomes = [];
    const anota = (cod) => {
      if (!cod) return;
      const c = typeof cod === "object" ? (cod.code || cod.name) : cod;
      const nome = (cias[c] && (cias[c].name || cias[c].displayName))
        || (typeof cod === "object" && cod.name) || c;
      if (!nomes.includes(nome)) nomes.push(nome);
    };
    for (const leg of r.legs || []) {
      const l = (leg && leg.segments) ? leg : (legsMap[leg && leg.id] || legsMap[leg] || {});
      for (const sg of l.segments || []) {
        const s = (sg && (sg.airline || sg.marketingAirline)) ? sg : (segs[sg && sg.id] || segs[sg] || {});
        anota(s.airline || s.marketingAirline || s.carrier);
      }
      if (l.airlines) for (const a of l.airlines) anota(a);
    }
    if (!nomes.length && r.airlines) for (const a of r.airlines) anota(a);
    return nomes.map((n) => ({ name: n }));
  }

  // Um item de resultado do Kayak: tem precos por agencia.
  const ehResultadoKayak = (r) => r && typeof r === "object"
    && (Array.isArray(r.bookingOptions) || Array.isArray(r.optionsByFare));

  // No poll, results[] fica no topo; no JSON embutido no HTML fica aninhado.
  // Procura o primeiro objeto com results[] de cara de Kayak (largura primeiro,
  // com teto para nao varrer 40 MB a toa).
  function achaKayak(raiz) {
    const fila = [raiz];
    for (let n = 0; fila.length && n < 50000; n++) {
      const o = fila.shift();
      if (!o || typeof o !== "object") continue;
      if (Array.isArray(o.results) && o.results.some(ehResultadoKayak)) return o;
      for (const v of Array.isArray(o) ? o : Object.values(o))
        if (v && typeof v === "object") fila.push(v);
    }
    return null;
  }

  function doKayak(entrada) {
    const pl = achaKayak(entrada);
    if (!pl) return null;
    const provedores = pl.providers || {};
    const agentes = new Map();
    const results = [];
    for (const r of pl.results) {
      if (!r || typeof r !== "object") continue;
      const ops = [...(r.bookingOptions || [])];
      for (const f of r.optionsByFare || []) ops.push(...((f && f.options) || []));
      const pricingOptions = [];
      for (const op of ops) {
        const v = precoKayak(op), ag = agenteKayak(op, provedores);
        if (v === null || !ag) continue;
        if (!agentes.has(ag.id)) agentes.set(ag.id, ag.nome);
        pricingOptions.push({ agentIds: [ag.id], price: { amount: v } });
      }
      if (!pricingOptions.length) continue;   // anuncio, card patrocinado
      results.push({
        id: r.resultId || r.id,
        legs: [{ carriers: { marketing: ciasKayak(r, pl) } }],
        pricingOptions,
      });
    }
    if (!results.length) return null;
    const st = String(pl.status || (pl.searchStatus || {}).status || "").toLowerCase();
    return {
      itineraries: {
        context: { status: st === "complete" || st === "done" ? "complete" : "incomplete" },
        agents: [...agentes].map(([id, name]) => ({ id, name })),
        results,
      },
    };
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
           SITES, siteDaUrl, doKayak, AGENCIAS, rotulosDaBusca, rotulaTodas, rotuloAtual,
           ciaCanonica, motivoSemCvc,
           indiceDePlaces, canoniza, consultaMensagensQuery, falhasDasMensagens,
           urlKibana };
})();

if (typeof module !== "undefined") module.exports = CVC;   // para teste_analise.js
