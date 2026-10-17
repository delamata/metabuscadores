// node --test tests/   (sem dependencias)
const test = require("node:test");
const assert = require("node:assert/strict");
const CVC = require("../analise.js");

test("reconhece o site pelo host", () => {
  assert.equal(CVC.siteDaUrl("https://www.skyscanner.com.br/transporte/passagens-aereas/saoa/rioa/260917/"), "skyscanner");
  assert.equal(CVC.siteDaUrl("https://www.skyscanner.net/transport/flights/lond/nyca/260917/"), "skyscanner");
  assert.equal(CVC.siteDaUrl("https://www.kayak.com.br/flights/SAO-RIO/2026-09-17"), "kayak");
  assert.equal(CVC.siteDaUrl("https://kayak.com.br/flights/SAO-RIO/2026-09-17"), "kayak");
  assert.equal(CVC.siteDaUrl("https://www.kayak.com/flights/SAO-RIO/2026-09-17"), null);
  assert.equal(CVC.siteDaUrl("https://evil-kayak.com.br/"), null);
  assert.equal(CVC.siteDaUrl("nao e url"), null);
});

test("rota do Skyscanner", () => {
  assert.deepEqual(
    CVC.cfgDaUrl("https://www.skyscanner.com.br/transporte/passagens-aereas/saoa/rioa/260917/260924/?adultsv2=2"),
    { origem: "SAOA", destino: "RIOA", ida: "2026-09-17", volta: "2026-09-24", adultos: 2 });
});

test("rota do Kayak: ida e volta, so ida, adultos, flexivel, varios aeroportos", () => {
  assert.deepEqual(
    CVC.cfgDaUrl("https://www.kayak.com.br/flights/SAO-RIO/2026-09-17/2026-09-24/2adults?sort=bestflight_a"),
    { origem: "SAO", destino: "RIO", ida: "2026-09-17", volta: "2026-09-24", adultos: 2 });
  assert.deepEqual(
    CVC.cfgDaUrl("https://www.kayak.com.br/flights/GRU-GIG/2026-09-17?sort=bestflight_a"),
    { origem: "GRU", destino: "GIG", ida: "2026-09-17", volta: null, adultos: 1 });
  assert.deepEqual(
    CVC.cfgDaUrl("https://www.kayak.com.br/flights/GRU,CGH-RIO/2026-09-17-flexible-1day/2026-09-24"),
    { origem: "GRU", destino: "RIO", ida: "2026-09-17", volta: "2026-09-24", adultos: 1 });
  assert.equal(CVC.cfgDaUrl("https://www.kayak.com.br/"), null);
  // a rota de um site nao vale no outro
  assert.equal(CVC.cfgDaUrl("https://www.kayak.com.br/transporte/passagens-aereas/saoa/rioa/260917/"), null);
});

test("canoniza o id de entidade do Skyscanner; Kayak ja vem no codigo da cidade", () => {
  const [sky] = CVC.canoniza({ origem: "SAOA", destino: "RIOA" }, {});
  assert.equal(sky.origem, "SAO");
  assert.equal(sky.destino, "RIO");
  const [kyk, fora] = CVC.canoniza({ origem: "SAO", destino: "RIO" }, {});
  assert.deepEqual([kyk.origem, kyk.destino, fora], ["SAO", "RIO", {}]);
});

const itin = (id, cias, opcoes) => ({
  id,
  legs: [{ carriers: { marketing: cias.map((name) => ({ name })) } }],
  pricingOptions: opcoes.map(([agentIds, amount]) => ({ agentIds, price: { amount } })),
});

const payload = (status, results) => ({
  itineraries: { context: { status }, agents: [{ id: "cvc_", name: "CVC" }, { id: "x", name: "X" }], results },
});

test("contaPorCia une polls sem contar duas vezes", () => {
  const p1 = payload("incomplete", [itin("a", ["Azul"], [[["cvc_"], 500], [["x"], 450]])]);
  const p2 = payload("complete", [
    itin("a", ["Azul"], [[["cvc_"], 480]]),
    itin("b", ["GOL Linhas Aéreas"], [[["x"], 300]]),
    itin("c", ["Azul", "GOL Linhas Aéreas"], [[["cvc_"], 900]]),
  ]);
  const r = CVC.contaPorCia([p1, p2], "cvc_");
  assert.equal(r.total_itinerarios, 3);
  assert.equal(r.itinerarios_do_agente, 2);
  assert.equal(r.busca_completou, true);
  assert.equal(r.agente_nome, "CVC");
  const azul = r.por_cia.find((l) => l.cia === "Azul");
  assert.equal(azul.voos_agente, 2);
  assert.equal(azul.menor_agente, 480);
  assert.equal(azul.menor_busca, 450);
  assert.deepEqual(r.combinadas, { "Azul+GOL Linhas Aéreas": 1 });
});

test("posicoes usam o payload mais completo", () => {
  const p = payload("complete", [
    itin("a", ["Azul"], [[["x"], 1]]),
    itin("b", ["Azul"], [[["cvc_"], 1]]),
  ]);
  const r = CVC.posicoesDoAgente([payload("incomplete", []), p], "cvc_");
  assert.deepEqual(r.posicoes, [2]);
  assert.equal(r.primeira, 2);
});

test("GOL em timeout nao herda o tempo de outra fonte (caso 8f022474)", () => {
  const log = CVC.agrupaLog({ hits: { hits: [
    { _source: { correlationId: "8f022474", "@timestamp": "2026-08-21T10:00:00Z", duration: 2776, parameters: { source: "LAT" } } },
    { _source: { correlationId: "8f022474", "@timestamp": "2026-08-21T10:00:01Z", duration: 10, parameters: { source: "GLL" } } },
  ] } });
  const falhas = CVC.falhasDasMensagens({ hits: { hits: [{ _source: {
    message: "CorrelationId: 8f022474 GwAereo consulting fail with source SGOL Detail: TimeoutException within 6000ms" } }] } });
  const [porCia, outras] = CVC.temposPorCia(log.por_correlation["8f022474"], CVC.FONTE_PARA_CIA, falhas);
  assert.equal(porCia["GOL Linhas Aéreas"].tempo_ms, null);
  assert.equal(porCia["GOL Linhas Aéreas"].timeout_ms, 6000);
  assert.equal(porCia["LATAM Airlines"].tempo_ms, 2776);
  assert.deepEqual(outras, { GLL: 10 });
});

test("routes do log", () => {
  assert.equal(CVC.rotasDoLog("SAO", "RIO", "2026-09-17", "2026-09-24"),
    "SAO,RIO,2026-09-17+RIO,SAO,2026-09-24");
  assert.equal(CVC.rotasDoLog("SAO", "RIO", "2026-09-17", null), "SAO,RIO,2026-09-17");
});

test("concorrente que trouxe o menor preco (geral e por companhia, com empate)", () => {
  const pl = {
    itineraries: {
      context: { status: "complete" },
      agents: [{ id: "cvc_", name: "CVC" }, { id: "dec", name: "Decolar" }, { id: "mm", name: "MaxMilhas" }],
      results: [
        itin("a", ["Azul"], [[["cvc_"], 500], [["dec"], 470], [["mm"], 470]]),
        itin("b", ["GOL Linhas Aéreas"], [[["cvc_", "dec"], 300], [["mm"], 320]]),
        itin("c", ["LATAM Airlines"], [[["cvc_"], 900]]),   // so a CVC vende
      ],
    },
  };
  const r = CVC.contaPorCia([pl], "cvc_");
  assert.equal(r.menor_concorrente, 300);
  assert.deepEqual(r.concorrentes, ["Decolar"]);   // opcao dividida com a CVC conta para o outro
  assert.equal(r.menor_agente, 300);
  const azul = r.por_cia.find((l) => l.cia === "Azul");
  assert.equal(azul.menor_concorrente, 470);
  assert.deepEqual(azul.concorrentes, ["Decolar", "MaxMilhas"]);
  assert.ok(Math.abs(azul.delta_concorrente - (30 / 470 * 100)) < 1e-9);
  // numeros antigos intactos
  assert.equal(azul.menor_busca, 470);
  const latam = r.por_cia.find((l) => l.cia === "LATAM Airlines");
  assert.equal(latam.menor_concorrente, null);
  assert.deepEqual(latam.concorrentes, []);
  assert.equal(latam.delta_concorrente, null);
});

// Formato do poll do Kayak (/i/api/search/dynamic/flights/poll), reduzido.
const kayak = () => ({
  searchId: "abc", status: "complete",
  airlines: { AD: { code: "AD", name: "Azul" }, G3: { code: "G3", name: "GOL" } },
  legs: { L1: { segments: [{ id: "S1" }, { id: "S2" }] }, L2: { segments: [{ id: "S3" }] } },
  segments: { S1: { airline: "AD" }, S2: { airline: "AD" }, S3: { airline: "G3" } },
  results: [
    { type: "ad", resultId: "anuncio" },   // card patrocinado: sem preco
    {
      type: "core", resultId: "r1", legs: [{ id: "L1" }],
      bookingOptions: [
        { providerInfo: { code: "VAIDEPROMO", displayName: "VaidePromo" }, displayPrice: { price: 1590 } },
        { providerInfo: { code: "CVCVIAGENS", displayName: "CVC Viagens" }, displayPrice: { price: 1787 } },
      ],
      optionsByFare: [{ options: [
        { providerInfo: { code: "MAXMILHAS", displayName: "MaxMilhas" }, displayPrice: { price: "R$ 1.637" } },
      ] }],
    },
    {
      type: "core", resultId: "r2", legs: [{ id: "L2" }],
      bookingOptions: [{ providerInfo: { code: "DECOLAR", displayName: "Decolar" }, fees: { rawPrice: 1675 } }],
    },
  ],
});

test("Kayak: traduz o poll para o formato da analise", () => {
  const pl = CVC.doKayak(kayak());
  const it = pl.itineraries;
  assert.equal(it.context.status, "complete");
  assert.equal(it.results.length, 2);                      // o anuncio sai
  assert.deepEqual(it.results[0].legs[0].carriers.marketing, [{ name: "Azul" }]);
  assert.deepEqual(it.results[1].legs[0].carriers.marketing, [{ name: "GOL" }]);
  const precos = it.results[0].pricingOptions.map((p) => [p.agentIds[0], p.price.amount]);
  assert.deepEqual(precos, [["VAIDEPROMO", 1590], ["cvc_", 1787], ["MAXMILHAS", 1637]]);
  assert.ok(it.agents.some((a) => a.id === "cvc_" && a.name === "CVC Viagens"));
});

test("Kayak: analise completa reconhece a CVC e o concorrente mais barato", () => {
  const r = CVC.contaPorCia([CVC.doKayak(kayak())], "cvc_");
  assert.equal(r.agente_participa_da_busca, true);
  assert.equal(r.agente_nome, "CVC Viagens");
  assert.equal(r.itinerarios_do_agente, 1);
  assert.equal(r.menor_concorrente, 1590);
  assert.deepEqual(r.concorrentes, ["VaidePromo"]);
  const azul = r.por_cia.find((l) => l.cia === "Azul");
  assert.equal(azul.menor_agente, 1787);
  assert.equal(azul.menor_concorrente, 1590);
});

test("Kayak: corpo sem resultados de preco nao vira dado", () => {
  assert.equal(CVC.doKayak({ results: [{ type: "ad" }] }), null);
  assert.equal(CVC.doKayak({ foo: 1 }), null);
  assert.equal(CVC.doKayak(null), null);
  assert.equal(CVC.doKayak({ status: "first-phase", results: [] }), null);
});
