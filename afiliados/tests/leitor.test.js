const test = require("node:test");
const assert = require("node:assert/strict");
const CAT = require("../catalogo.js");
const L = require("../leitor.js");

test("preco: formatos do Melhores Destinos", () => {
  assert.equal(L.precoDe("... a partir de R$ 2.341 ida e volta"), 2341);
  assert.equal(L.precoDe("por R$ 1.088,90 por pessoa"), 1088.9);
  assert.equal(L.precoDe("R$289 ida e volta"), 289);
  assert.equal(L.precoDe("sem preço aqui"), null);
});

test("tipo da oferta pelo titulo", () => {
  assert.equal(L.tipoDe("Parques da Flórida! Bons preços em voos para Orlando a partir de R$ 2.341 ida e volta"), "passagem");
  assert.equal(L.tipoDe("Bora pra Bahia! Pacotes de viagem baratos para Salvador a partir de R$ 1.088"), "pacote");
  assert.equal(L.tipoDe("Litoral de SP com até 28% OFF! Hotéis em Ilhabela a partir de R$ 401"), "hotel");
});

test("agencia pelo dominio, inclusive dentro de redirect de afiliado", () => {
  assert.equal(L.agenciaDoLink("https://www.cvc.com.br/pacotes/salvador").rotulo, "CVC");
  assert.equal(L.agenciaDoLink("https://www.decolar.com/passagens").rotulo, "Player 1");
  assert.equal(L.agenciaDoLink("https://www.melhoresdestinos.com.br/go?url=https%3A%2F%2Fwww.cvc.com.br%2Fx").rotulo, "CVC");
  assert.equal(L.agenciaDoLink("https://track.afiliado.net/c?a=1&dest=https%3A%2F%2Fwww.123milhas.com%2Fv").rotulo, "Player 4");
  assert.equal(L.agenciaDoLink("https://www.decolar.com.ar/x"), null);          // outro dominio
  assert.equal(L.agenciaDoLink("https://www.cvc.com.br.golpe.com/x"), null);    // nao e o dominio
  assert.equal(L.agenciaDoLink("https://www.melhoresdestinos.com.br/promocao/x"), null);
});

test("agencias citadas no titulo; so a CVC com nome real", () => {
  const ag = CAT.noTexto("Europa! Voos diretos da Latam para Lisboa a partir de R$ 3.550").map((a) => a.rotulo);
  assert.deepEqual(ag, ["Player 11"]);
  assert.deepEqual(CAT.noTexto("Pacotes CVC para Salvador").map((a) => a.rotulo), ["CVC"]);
  for (const a of CAT.TODAS) if (a.id !== "cvc") assert.match(a.rotulo, /^Player \d+$/);
});

test("tipo de pagina", () => {
  assert.equal(L.tipoDePagina("https://www.melhoresdestinos.com.br/"), "lista");
  assert.equal(L.tipoDePagina("https://www.melhoresdestinos.com.br/promocao/chile-2-em-1-2070"), "post");
  assert.equal(L.tipoDePagina("https://www.melhoresdestinos.com.br/promocao"), "lista");
});

test("resumo: quantidade por player e comparativo de preco com a CVC", () => {
  const ag = (id) => { const a = CAT.TODAS.find((x) => x.id === id); return { id: a.id, rotulo: a.rotulo, cor: a.cor || null }; };
  const ofertas = [
    { preco: 1000, agencias: [ag("cvc")] }, { preco: 900, agencias: [ag("cvc")] },
    { preco: 950, agencias: [ag("p1")] }, { preco: 1200, agencias: [ag("p4")] }, { preco: 800, agencias: [] },
  ];
  const r = L.resumo(ofertas);
  assert.equal(r.total, 5);
  assert.equal(r.semAgencia, 1);
  assert.equal(r.cvc_ofertas, 2);
  assert.equal(r.cvc_menor, 900);
  assert.equal(r.concorrentes_ofertas, 2);
  assert.deepEqual(r.por_agencia.map((a) => [a.rotulo, a.ofertas, a.menor]), [["CVC", 2, 900], ["Player 1", 1, 950], ["Player 4", 1, 1200]]);
  const p1 = r.comparativo.find((c) => c.rotulo === "Player 1");
  assert.ok(Math.abs(p1.dif - (-50 / 950 * 100)) < 1e-9);    // CVC 5,3% mais barata
  // sem CVC: comparativo sem %
  assert.equal(L.resumo([{ preco: 950, agencias: [ag("p1")] }]).comparativo[0].dif, null);
});

test("mascara: so a CVC com nome real nos textos do site", () => {
  assert.equal(CAT.mascara("Ver na Decolar"), "Ver na Player 1");
  assert.equal(CAT.mascara("Ganhe 6% de cashback na Booking.com e até 40% OFF"), "Ganhe 6% de cashback na Player 8 e até 40% OFF");
  assert.equal(CAT.mascara("Voos diretos da Latam e da GOL; pacotes 123milhas"), "Voos diretos da Player 11 e da Player 10; pacotes Player 4");
  assert.equal(CAT.mascara("Pacotes CVC para Salvador"), "Pacotes CVC para Salvador");
  assert.equal(CAT.mascara("Golfe em Gotogate"), "Golfe em Player 12");          // "Golfe" nao e GOL
});
