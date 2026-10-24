const test = require("node:test");
const assert = require("node:assert/strict");
const ROTINA = require("../rotina.js");
const CVC = require("../analise.js");

test("config padrao: 5 rotas, 9h/15h/21h; sanitiza o que vem do painel", () => {
  const c = ROTINA.config();
  assert.deepEqual(c.rotas, ["SAO-RIO", "SAO-SSA", "SAO-MCZ", "SAO-FOR", "SAO-REC"]);
  assert.deepEqual(c.horarios, [9, 15, 21]);
  const s = ROTINA.config({ rotas: [" sao-rio ", "XX", "GRU-GIG"], horarios: [21, 9, 9, 25, "15"] });
  assert.deepEqual(s.rotas, ["SAO-RIO", "GRU-GIG"]);
  assert.deepEqual(s.horarios, [9, 15, 21]);
});

test("URL da rodada e lida pelo proprio addon (mesma rota e datas)", () => {
  const c = ROTINA.config({ adultos: 2 });
  const f = ROTINA.fila(c, new Date(2026, 9, 24, 9, 0, 0));
  assert.equal(f.length, 5);
  assert.equal(f[0].ida, "2026-11-23");
  assert.equal(f[0].volta, "2026-11-30");
  assert.equal(f[0].url, "https://www.kayak.com.br/flights/SAO-RIO/2026-11-23/2026-11-30/2adults?sort=bestflight_a");
  assert.deepEqual(CVC.cfgDaUrl(f[2].url), { origem: "SAO", destino: "MCZ", ida: "2026-11-23", volta: "2026-11-30", adultos: 2 });
  const soIda = ROTINA.fila(ROTINA.config({ noites: 0 }), new Date(2026, 9, 24));
  assert.equal(soIda[0].volta, null);
  assert.equal(CVC.cfgDaUrl(soIda[0].url).volta, null);
});

test("proximo horario: hoje se ainda nao passou, amanha se ja passou", () => {
  const agora = new Date(2026, 9, 24, 14, 30);
  assert.equal(ROTINA.proximo(15, agora).getTime(), new Date(2026, 9, 24, 15, 0).getTime());
  assert.equal(ROTINA.proximo(9, agora).getTime(), new Date(2026, 9, 25, 9, 0).getTime());
  assert.equal(ROTINA.proximo(14, new Date(2026, 9, 24, 14, 0)).getTime(), new Date(2026, 9, 25, 14, 0).getTime());
});

test("pagina de verificacao de robo e reconhecida (a rodada para, nao contorna)", () => {
  assert.ok(ROTINA.bloqueio("https://www.kayak.com.br/help/bots.html?url=x", ""));
  assert.ok(ROTINA.bloqueio("https://www.kayak.com.br/x", "Você é um robô?"));
  assert.ok(ROTINA.bloqueio("https://site/captcha", ""));
  assert.ok(!ROTINA.bloqueio("https://www.kayak.com.br/flights/SAO-RIO/2026-11-23/2026-11-30?sort=bestflight_a", "SAO para RIO | KAYAK"));
});

test("casa a linha do historico com a rota da fila", () => {
  const it = { rota: "SAO-RIO", ida: "2026-11-23", volta: "2026-11-30", aberta_em: Date.parse("2026-10-24T12:00:00Z") };
  assert.ok(ROTINA.casa({ rota: "SAO-RIO", ida: "2026-11-23", volta: "2026-11-30", quando: "2026-10-24T12:02:00Z" }, it));
  assert.ok(!ROTINA.casa({ rota: "SAO-RIO", ida: "2026-11-23", volta: "2026-11-30", quando: "2026-10-24T11:00:00Z" }, it)); // antiga
  assert.ok(!ROTINA.casa({ rota: "SAO-SSA", ida: "2026-11-23", volta: "2026-11-30", quando: "2026-10-24T12:02:00Z" }, it));
  assert.ok(!ROTINA.casa({ rota: "SAO-RIO", ida: "2026-11-23", volta: null, quando: "2026-10-24T12:02:00Z" }, it));
});

const linha = (chave, rota, v, cvc = 1000) => ({ chave, rota, ida: "2026-11-23", volta: "2026-11-30", quando: "2026-10-24T12:00:00Z",
  preco_cvc: cvc, preco_decolar: 1000, variacao_pct: v, voos_cvc: 5, voos_decolar: 8, voos_busca: 10 });

test("resumo da rodada e consolidacao do relatorio", () => {
  const r1 = { id: "2026-10-24 09h", inicio: 1, fim: 2, fila: [
    { rota: "SAO-RIO", status: "ok", chave: "hist:a" }, { rota: "SAO-SSA", status: "ok", chave: "hist:b" },
    { rota: "SAO-MCZ", status: "sem_dados" }] };
  const r2 = { id: "2026-10-24 15h", inicio: 3, fim: 4, fila: [
    { rota: "SAO-RIO", status: "ok", chave: "hist:c" }, { rota: "SAO-SSA", status: "bloqueio" },
    { rota: "SAO-MCZ", status: "cancelada" }] };
  const linhas = [linha("hist:a", "SAO-RIO", -5), linha("hist:b", "SAO-SSA", 3), linha("hist:c", "SAO-RIO", -1, null)];
  const s1 = ROTINA.resumo(r1, linhas);
  assert.equal(s1.texto, "2 de 3 rotas lidas. CVC mais barata que o Player 1 em 1 de 2.");
  const s2 = ROTINA.resumo(r2, linhas);
  assert.ok(s2.bloqueada);
  assert.equal(s2.texto, "1 de 3 rotas lidas. CVC mais barata que o Player 1 em 1 de 1. CVC sem oferta em 1. O Kayak pediu verificação de robô: rodada interrompida.");
  const d = ROTINA.consolida([r2, r1, { id: "em andamento", inicio: 5, fila: [] }], linhas, 9);
  assert.deepEqual(d.rodadas.map((r) => r.id), ["2026-10-24 09h", "2026-10-24 15h"]);   // so as encerradas, em ordem
  assert.deepEqual(d.kpis, { rodadas: 2, buscas: 3, comparaveis: 3, cvcMaisBarata: 2, mediaVariacao: -1, bloqueios: 1 });
  assert.equal(d.ultima.id, "2026-10-24 15h");
  assert.deepEqual(d.matriz.find((m) => m.rota === "SAO-RIO").celulas.map((c) => c.linha && c.linha.variacao_pct), [-5, -1]);
  assert.deepEqual(d.matriz.find((m) => m.rota === "SAO-SSA").celulas.map((c) => c.status), ["ok", "bloqueio"]);
});
