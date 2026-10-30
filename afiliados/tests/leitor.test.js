const test = require("node:test");
const assert = require("node:assert/strict");
const CAT = require("../catalogo.js");
const L = require("../leitor.js");

// <script> inline do post "Parques da Florida" (HAR de 30/10/2026)
const SCRIPT_POST = `
	var idPost = 644987;
  var publication_json = {"key":"i7does91p5u4qlvk","active":true,"publication_type":"air_tickets","has_prices":true,"itinerary_price_type":"RoundtripItineraryPrice","search_engine_configuration":{"providers":["viajanet","latam","decolar","gol","cvc"],"is_executive":false}};
  var utm_buscador = "buscador_lateral_post";`;

test("preco: formatos do Melhores Destinos", () => {
  assert.equal(L.precoDe("... a partir de R$ 2.341 ida e volta"), 2341);
  assert.equal(L.precoDe("R$ 1.088,90"), 1088.9);
  assert.equal(L.precoDe("R$289"), 289);
  assert.equal(L.precoDe("12.000 PTS"), null);
});

test("so o post de promocao", () => {
  assert.equal(L.ehPromo("https://www.melhoresdestinos.com.br/promocao/parques-da-florida-voos-orlando-tampa-2341"), true);
  assert.equal(L.ehPromo("https://www.melhoresdestinos.com.br/promocao/x/?utm=1"), true);
  assert.equal(L.ehPromo("https://www.melhoresdestinos.com.br/promocao"), false);
  assert.equal(L.ehPromo("https://www.melhoresdestinos.com.br/"), false);
});

test("dados da promocao pelo script inline", () => {
  const p = L.dadosDaPromo(["var x = 1;", SCRIPT_POST]);
  assert.equal(p.key, "i7does91p5u4qlvk");
  assert.deepEqual(p.search_engine_configuration.providers, ["viajanet", "latam", "decolar", "gol", "cvc"]);
  assert.equal(L.dadosDaPromo(["var promo = {quebrado;"]), null);
});

test("vendedores do buscador: CVC com nome, os demais como Player N", () => {
  const v = L.vendedores(L.dadosDaPromo([SCRIPT_POST]));
  assert.deepEqual(v.lista.map((a) => a.rotulo), ["Player 7", "Player 11", "Player 1", "Player 10", "CVC"]);
  assert.equal(v.cvc, true);
  assert.equal(v.primeiro.rotulo, "Player 1");          // o botao abre a Decolar (prioridade do site)
  assert.deepEqual(v.desconhecidos, []);
  assert.equal(v.cvc_posicao, 5);                       // 5a de 5 na lista do buscador
  assert.equal(v.cvc_vez_botao, 3);                     // 3a na escolha do botao
  assert.deepEqual(v.antes_da_cvc, ["Player 1", "Player 11"]);
  const so = L.vendedores({ search_engine_configuration: { providers: ["gol", "cvc", "novaagencia"] } });
  assert.equal(so.primeiro.rotulo, "CVC");              // sem decolar/latam, a CVC vem antes
  assert.equal(so.lista[2].rotulo, "Player ?");
  assert.deepEqual(so.desconhecidos, ["novaagencia"]);
  assert.equal(so.cvc_vez_botao, 1); assert.deepEqual(so.antes_da_cvc, []);
  assert.equal(L.vendedores(null).lista.length, 0);
});

test("prioridade do botao igual ao motor do site", () => {
  assert.equal(L.abrePrimeiro(["viajanet", "latam", "decolar"]), "decolar");
  assert.equal(L.abrePrimeiro(["viajanet", "gol", "latam"]), "latam");
  assert.equal(L.abrePrimeiro(["gol", "viajanet"]), "viajanet");
  assert.equal(L.abrePrimeiro(["smiles"]), "decolar");   // padrao do site
});

test("resumo dos trechos: menor, mediana, por destino", () => {
  const trechos = [
    { origem: "São Paulo", destino: "Orlando", preco: 2341 }, { origem: "São Paulo", destino: "Tampa", preco: 2600 },
    { origem: "Recife", destino: "Orlando", preco: 3100 }, { origem: "Recife", destino: "Tampa", preco: 3500 },
  ];
  const r = L.resumo({ trechos });
  assert.equal(r.trechos, 4); assert.equal(r.menor, 2341); assert.equal(r.maior, 3500); assert.equal(r.mediana, 2850);
  assert.equal(r.origens, 2);
  assert.deepEqual(r.por_destino.map((d) => [d.nome, d.n, d.menor, d.maior]), [["Orlando", 2, 2341, 3100], ["Tampa", 2, 2600, 3500]]);
});

test("catalogo: so a CVC com nome real", () => {
  for (const a of CAT.TODAS) if (a.id !== "cvc") assert.match(a.rotulo, /^Player \d+$/);
  assert.equal(CAT.mascara("Voos da Latam e Gol"), "Voos da Player 11 e Player 10");
});
