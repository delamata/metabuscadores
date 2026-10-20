const test = require("node:test");
const assert = require("node:assert/strict");
const HIST = require("../historico.js");

const resultado = {
  site: "kayak", site_nome: "Kayak",
  cfg: { origem: "SAO", destino: "MCZ", ida: "2026-11-16", volta: "2026-11-27", adultos: 2 },
  menor_agente: 3673.88, menor_rival: 3956, delta_rival: (3673.88 - 3956) / 3956 * 100,
  itinerarios_do_agente: 93, itinerarios_do_rival: 367, total_itinerarios: 412, busca_completou: true,
  menor_geral: { valor: 3500, agencias: [{ id: "zup", nome: "Zupper", rotulo: "Concorrente 3", cor: "tiffany" }] },
  maior_geral: { valor: 9100, agencias: [{ id: "gtg", nome: "Gotogate", rotulo: "Gotogate", cor: null }] },
  frente_a_frente: { cvc: 12, rival: 27, empate: 3 },
  posicoes: { primeira: 2, no_topo: { 5: 2, 10: 3 } },
  por_agente: [
    { id: "dec", nome: "Decolar", rotulo: "Concorrente 1", voos: 367, menor: 3956 },
    { id: "cvc_", nome: "CVC", rotulo: "CVC", voos: 93, menor: 3673.88 },
    { id: "zup", nome: "Zupper", rotulo: "Concorrente 3", voos: 40, menor: 3500 },
  ],
};

test("linha do historico a partir do resultado", () => {
  const l = HIST.linhaDoResultado(resultado, new Date("2026-10-19T13:05:09Z"));
  assert.deepEqual(l, {
    quando: "2026-10-19T13:05:09.000Z", site: "Kayak", rota: "SAO-MCZ",
    ida: "2026-11-16", volta: "2026-11-27", adultos: 2,
    preco_cvc: 3673.88, preco_decolar: 3956, variacao_pct: -7.13,
    voos_cvc: 93, voos_decolar: 367, voos_busca: 412, busca_completa: true,
    menor_busca: 3500, agencia_menor: "Concorrente 3", maior_busca: 9100, agencia_maior: "Gotogate",
    frente_cvc: 12, frente_rival: 27, frente_empate: 3, primeira_posicao: 2, cvc_top10: 3,
    agencias: [{ rotulo: "Concorrente 1", voos: 367, menor: 3956 }, { rotulo: "CVC", voos: 93, menor: 3673.88 },
               { rotulo: "Concorrente 3", voos: 40, menor: 3500 }],
  });
});

test("sem oferta fica vazio, nunca zero", () => {
  const l = HIST.linhaDoResultado({ cfg: { origem: "SAO", destino: "RIO", ida: "2026-09-17", volta: null, adultos: 1 },
    menor_agente: 500, menor_rival: null, delta_rival: null, busca_completou: false });
  assert.equal(l.preco_decolar, null);
  assert.equal(l.variacao_pct, null);
  assert.equal(l.volta, null);
  const csv = HIST.csv([l]);
  const linha = csv.split("\r\n")[1].split(";");
  assert.equal(linha[5], "");      // Data Volta
  assert.equal(linha[8], "");      // Preco Decolar
  assert.equal(linha[9], "");      // %Variacao
  assert.equal(linha[13], "");     // Cobertura CVC: sem total de voos
  assert.equal(linha[29], "não");  // Busca completa
  assert.equal(linha[15], "");     // Preco Concorrente 3: linha antiga/sem dado
});

test("le so as chaves do historico, em ordem de data", () => {
  const tudo = {
    estado: { estado: "pronto" }, config: { es_url: "x" },
    "hist:b": { quando: "2026-10-19T10:00:00.000Z", rota: "B" },
    "hist:a": { quando: "2026-10-18T10:00:00.000Z", rota: "A" },
  };
  const ls = HIST.deStorage(tudo);
  assert.deepEqual(ls.map((l) => [l.chave, l.rota]), [["hist:a", "A"], ["hist:b", "B"]]);
  assert.ok(HIST.chaveNova(new Date("2026-10-19T00:00:00Z")).startsWith("hist:2026-10-19T00:00:00.000Z-"));
});

test("CSV no padrao do Excel pt-BR: BOM, ponto e virgula, virgula decimal", () => {
  const csv = HIST.csv([HIST.linhaDoResultado(resultado, new Date("2026-10-19T13:05:09Z"))]);
  assert.ok(csv.startsWith("﻿"));
  const [cab, linha] = csv.slice(1).split("\r\n");
  assert.equal(cab, "Data da busca;Hora;Site;Rota;Data Ida;Data Volta;Adultos;Preço CVC;Preço Concorrente 1;"
    + "%Variação;Voos CVC;Voos Concorrente 1;Voos na busca;Cobertura CVC %;Cobertura Concorrente 1 %;"
    + "Preço Concorrente 3;Voos Concorrente 3;Cobertura Concorrente 3 %;Menor preço da busca;Agência menor preço;"
    + "Maior preço da busca;Agência maior preço;Voos CVC mais barata;Voos Concorrente 1 mais barato;"
    + "Voos empatados;1ª posição CVC;CVC no top 10;Agências na busca;Cobertura por agência;Busca completa");
  const c = linha.split(";");
  assert.equal(c[2], "Kayak");
  assert.equal(c[3], "SAO-MCZ");
  assert.equal(c[4], "16/11/2026");
  assert.equal(c[5], "27/11/2026");
  assert.equal(c[7], "3673,88");
  assert.equal(c[8], "3956,00");
  assert.equal(c[9], "-7,13");
  assert.equal(c[13], "22,6");     // 93 / 412
  assert.equal(c[15], "3500,00");  // Preco Concorrente 3
  assert.equal(c[16], "40");
  assert.equal(c[17], "9,7");      // 40 / 412
  assert.equal(c[18], "3500,00");
  assert.equal(c[19], "Concorrente 3");
  assert.equal(c[20], "9100,00");
  assert.equal(c[21], "Gotogate");
  assert.deepEqual(c.slice(22, 28), ["12", "27", "3", "2", "3", "3"]);
  assert.equal(c[28], "Concorrente 1: 89,1% (367 voos, menor 3956,00) | CVC: 22,6% (93 voos, menor 3673,88)"
    + " | Concorrente 3: 9,7% (40 voos, menor 3500,00)");
  assert.equal(c[14], "89,1");     // 367 / 412
  assert.equal(c[29], "sim");
});

test("CSV escapa texto com ponto e virgula ou aspas", () => {
  const csv = HIST.csv([{ quando: "2026-10-19T10:00:00Z", site: 'Ka;y"ak', rota: "X" }]);
  assert.ok(csv.includes('"Ka;y""ak"'));
});
