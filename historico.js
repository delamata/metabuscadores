// Historico das buscas: uma linha por busca fechada, guardada no navegador
// (chrome.storage.local), e a exportacao para Excel (CSV).
//
// Cada linha vai numa chave propria ("hist:<data>-<aleatorio>") e nao num
// array unico: com Kayak e Skyscanner abertos em duas abas, um array seria
// lido-alterado-gravado pelas duas ao mesmo tempo e uma busca sumiria.
var HIST = (() => {
  const PREFIXO = "hist:";

  // Precisao de exibicao: a % e guardada com 2 casas, o preco como veio.
  const arred2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

  // Monta a linha a partir do resultado publicado pelo coletor.
  function linhaDoResultado(res, quando) {
    const c = res.cfg || {};
    return {
      quando: (quando || new Date()).toISOString(),
      site: res.site_nome || res.site || null,
      rota: c.origem && c.destino ? `${c.origem}-${c.destino}` : null,
      ida: c.ida || null,
      volta: c.volta || null,
      adultos: c.adultos ?? null,
      // sem oferta = vazio, nunca zero
      preco_cvc: res.menor_agente ?? null,
      preco_decolar: res.menor_rival ?? null,
      // (CVC - Decolar) / Decolar: positivo = CVC mais cara
      variacao_pct: arred2(res.delta_rival),
      voos_cvc: res.itinerarios_do_agente ?? null,
      voos_decolar: res.itinerarios_do_rival ?? null,
      voos_busca: res.total_itinerarios ?? null,
      busca_completa: !!res.busca_completou,
      // menor e maior preco da busca inteira, de qualquer agencia
      menor_busca: (res.menor_geral || {}).valor ?? null,
      agencia_menor: rotulos((res.menor_geral || {}).agencias),
      maior_busca: (res.maior_geral || {}).valor ?? null,
      agencia_maior: rotulos((res.maior_geral || {}).agencias),
      // frente a frente CVC x Player 1 nos voos que os dois vendem
      frente_cvc: (res.frente_a_frente || {}).cvc ?? null,
      frente_rival: (res.frente_a_frente || {}).rival ?? null,
      frente_empate: (res.frente_a_frente || {}).empate ?? null,
      primeira_posicao: (res.posicoes || {}).primeira ?? null,
      cvc_top10: ((res.posicoes || {}).no_topo || {})[10] ?? null,
      // todas as agencias: rotulo do painel (sem nome real), voos com oferta e menor preco
      agencias: (res.por_agente || []).map((a) => ({ rotulo: a.rotulo || a.nome, voos: a.voos, menor: a.menor })),
    };
  }

  // So a CVC com nome real, tambem no Excel: os concorrentes saem pelo rotulo
  // ("Player 3"), que e fixo por agencia e permite comparar linhas.
  const rotulos = (ags) => ((ags && ags.length) ? ags.map((a) => a.rotulo || a.nome).join(", ") : null);
  const zpr = (l) => (l.agencias || []).find((a) => a.rotulo === "Player 2") || {};

  function chaveNova(quando) {
    return `${PREFIXO}${(quando || new Date()).toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Linhas gravadas com rotulos antigos ("Concorrente dcl" na v0.13.0,
  // "Player - DCL" na v0.14.0) saem no padrao atual ("Player 1"): a conversao
  // usa o catalogo de agencias do analise.js.
  const C = typeof CVC !== "undefined" ? CVC : require("./analise.js");
  const atualiza = (t) => C.rotuloAtual(t);
  function normaliza(l) {
    const n = Object.assign({}, l, { agencia_menor: atualiza(l.agencia_menor), agencia_maior: atualiza(l.agencia_maior) });
    if (Array.isArray(l.agencias)) n.agencias = l.agencias.map((a) => Object.assign({}, a, { rotulo: atualiza(a.rotulo) }));
    return n;
  }

  // Todas as linhas guardadas, da mais antiga para a mais nova.
  function deStorage(tudo) {
    return Object.entries(tudo || {})
      .filter(([k]) => k.startsWith(PREFIXO))
      .map(([k, v]) => normaliza(Object.assign({ chave: k }, v)))
      .sort((a, b) => (a.quando < b.quando ? -1 : a.quando > b.quando ? 1 : 0));
  }

  // ---- CSV para o Excel em portugues ------------------------------------- #
  // ";" como separador e virgula decimal (o Excel pt-BR abre direto), BOM
  // UTF-8 para os acentos, e data/hora no fuso de quem exporta.
  const COLUNAS = [
    ["Data da busca", (l) => dataBr(l.quando)],
    ["Hora", (l) => horaBr(l.quando)],
    ["Site", (l) => l.site],
    ["Rota", (l) => l.rota],
    ["Data Ida", (l) => isoParaBr(l.ida)],
    ["Data Volta", (l) => isoParaBr(l.volta)],
    ["Adultos", (l) => l.adultos],
    ["Preço CVC", (l) => num(l.preco_cvc, 2)],
    ["Preço Player 1", (l) => num(l.preco_decolar, 2)],
    ["%Variação", (l) => num(l.variacao_pct, 2)],
    ["Voos CVC", (l) => l.voos_cvc],
    ["Voos Player 1", (l) => l.voos_decolar],
    ["Voos na busca", (l) => l.voos_busca],
    // calculadas na exportacao, entao valem tambem para linhas ja gravadas
    ["Cobertura CVC %", (l) => num(cobertura(l.voos_cvc, l.voos_busca), 1)],
    ["Cobertura Player 1 %", (l) => num(cobertura(l.voos_decolar, l.voos_busca), 1)],
    ["Preço Player 2", (l) => num(zpr(l).menor, 2)],
    ["Voos Player 2", (l) => zpr(l).voos],
    ["Cobertura Player 2 %", (l) => num(cobertura(zpr(l).voos, l.voos_busca), 1)],
    ["Concorrente + Barato (preço)", (l) => num(l.menor_busca, 2)],
    ["Concorrente + Barato", (l) => l.agencia_menor],
    ["Concorrente + Caro (preço)", (l) => num(l.maior_busca, 2)],
    ["Concorrente + Caro", (l) => l.agencia_maior],
    ["Voos CVC mais barata", (l) => l.frente_cvc],
    ["Voos Player 1 mais barato", (l) => l.frente_rival],
    ["Voos empatados", (l) => l.frente_empate],
    ["1ª posição CVC", (l) => l.primeira_posicao],
    ["CVC no top 10", (l) => l.cvc_top10],
    ["Agências na busca", (l) => (l.agencias ? l.agencias.length : null)],
    // todas as agencias numa celula: "Player 1: 89,1% (367 voos, menor 3956,00) | ..."
    // melhor preco de cada agencia, do mais barato para o mais caro:
    // "Player 2: 3099,90 | CVC: 3366,34 | ..."
    ["Melhor preço por concorrente", (l) => (l.agencias || []).filter((a) => a.menor != null)
      .slice().sort((x, y) => x.menor - y.menor).map((a) => `${a.rotulo}: ${num(a.menor, 2)}`).join(" | ")],
    ["Cobertura por agência", (l) => (l.agencias || []).map((a) =>
      `${a.rotulo}: ${num(cobertura(a.voos, l.voos_busca), 1)}% (${a.voos} voos, menor ${num(a.menor, 2)})`).join(" | ")],
    ["Busca completa", (l) => (l.busca_completa ? "sim" : "não")],
  ];

  // % dos voos da busca em que a agencia tem oferta; sem total, vazio
  const cobertura = (n, total) => (n == null || !total ? null : n / total * 100);

  const pad = (n) => String(n).padStart(2, "0");
  function dataBr(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  function horaBr(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  function isoParaBr(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  }
  // sem separador de milhar: o Excel le "3673,88" como numero
  const num = (v, casas) => (v == null || !Number.isFinite(v) ? "" : v.toFixed(casas).replace(".", ","));

  function celula(v) {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function csv(linhas) {
    const cab = COLUNAS.map(([n]) => n).join(";");
    const corpo = linhas.map((l) => COLUNAS.map(([, f]) => celula(f(l))).join(";"));
    return "﻿" + [cab, ...corpo].join("\r\n") + "\r\n";
  }

  return { PREFIXO, linhaDoResultado, chaveNova, deStorage, csv, COLUNAS };
})();

if (typeof module !== "undefined") module.exports = HIST;   // para os testes
