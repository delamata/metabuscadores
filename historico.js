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
    };
  }

  function chaveNova(quando) {
    return `${PREFIXO}${(quando || new Date()).toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Todas as linhas guardadas, da mais antiga para a mais nova.
  function deStorage(tudo) {
    return Object.entries(tudo || {})
      .filter(([k]) => k.startsWith(PREFIXO))
      .map(([k, v]) => Object.assign({ chave: k }, v))
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
    ["Preço Decolar", (l) => num(l.preco_decolar, 2)],
    ["%Variação", (l) => num(l.variacao_pct, 2)],
    ["Voos CVC", (l) => l.voos_cvc],
    ["Voos Decolar", (l) => l.voos_decolar],
    ["Voos na busca", (l) => l.voos_busca],
    ["Busca completa", (l) => (l.busca_completa ? "sim" : "não")],
  ];

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
