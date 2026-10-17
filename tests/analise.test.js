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
