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

// resposta de /passagens_json/ no formato do HAR de BHZ -> TPA (30/10/2026), encurtada
const URL_VOOS = "https://www.melhoresdestinos.com.br/voos?rota=BHZ/TPA/i7does91p5u4qlvk&slug_post=parques-da-florida-voos-orlando-tampa-2341__644987";
const data = (ida, preco, nome, link, cia = "G3") => ({ departure: ida, departure_txt: "Quarta", arrival: "2/3", arrival_txt: "Terça", stay: 13,
  price: preco, airline_code: cia, link, provider_name: nome, website_display: `no site da ${nome}`, luggage_type: "carry_on_luggage_only" });
const JSON_VOOS = {
  itinerary_price_type: "RoundtripItineraryPrice", from_city_name: "Belo Horizonte", to_city_name: "Tampa",
  publication_url: "https://www.melhoresdestinos.com.br/promocao/parques-da-florida-voos-orlando-tampa-2341",
  search_engine_configuration: { providers: ["viajanet", "latam", "decolar", "gol", "cvc"] },
  months: [
    { month: "Jan", year: 2027, price: 3600, cheapest: false },
    { month: "Fev", year: 2027, price: 3218, cheapest: true, dates: [
      data("18/2", 3219, "Decolar", "https://www.decolar.com/x"),
      data("17/2", 3218, "CVC", "https://cvc.com.br/passagens/v2/search/CNF/TPA"),
      data("19/2", 3218, "Decolar", "https://www.decolar.com/y"),
      data("20/2", 3500, "Agencia Nova", "https://www.cvc.com.br/z", "LA"),       // nome desconhecido, dominio da CVC
      data("21/2", 3900, "Outra", "https://outra.com/z", "CM"),
    ] },
  ],
};

test("ver datas: so a pagina de um trecho", () => {
  assert.equal(L.ehVoos(URL_VOOS), true);
  assert.equal(L.ehVoos("https://www.melhoresdestinos.com.br/voos"), false);
  assert.equal(L.ehVoos("https://www.melhoresdestinos.com.br/promocao/x"), false);
});

test("ver datas: vendedor de cada preco, mascarado", () => {
  const l = L.lerVoos(JSON_VOOS, URL_VOOS);
  assert.equal(l.de, "BHZ"); assert.equal(l.para, "TPA"); assert.equal(l.slug, "parques-da-florida-voos-orlando-tampa-2341");
  assert.equal(l.datas.length, 5);
  assert.deepEqual(l.datas.map((d) => d.vendedor.rotulo), ["Player 1", "CVC", "Player 1", "CVC", "Player ?"]);
  assert.deepEqual(l.datas.map((d) => d.cia), ["Player 10", "Player 10", "Player 10", "Player 11", "CM"]);
  assert.deepEqual(l.desconhecidos, ["Outra"]);
  assert.equal(l.datas[0].mes, "2027-02");
  assert.deepEqual(l.meses.map((m) => m.mes), ["2027-01", "2027-02"]);
  assert.ok(!JSON.stringify(l.datas).match(/decolar/i));
});

test("ver datas: preco da CVC, posicao e comparativo", () => {
  const r = L.resumoVoos(L.lerVoos(JSON_VOOS, URL_VOOS));
  assert.equal(r.menor, 3218);
  assert.equal(r.cvc_menor, 3218);
  assert.equal(r.cvc_lugar_preco, 1);           // 1a entre os vendedores
  assert.equal(r.cvc_posicao_lista, 1);         // empate de preco: vale a ordem do site
  assert.equal(r.cvc_datas, 2);
  const p1 = r.comparativo.find((c) => c.id === "p1");
  assert.equal(p1.menor, 3218); assert.equal(p1.dif, 0);
  assert.equal(r.vendedores, 3);
});

test("ver datas: cada mes clicado soma; o mesmo mes substitui", () => {
  const fev = L.lerVoos(JSON_VOOS, URL_VOOS);
  const jan = L.lerVoos({ ...JSON_VOOS, months: [{ month: "Jan", year: 2027, price: 3600, dates: [data("5/1", 3600, "CVC", "")] }] }, URL_VOOS);
  const junto = L.juntaVoos(fev, jan);
  assert.equal(junto.datas.length, 6);
  assert.equal(L.juntaVoos(junto, fev).datas.length, 6);
  assert.equal(L.juntaVoos(junto, L.lerVoos(JSON_VOOS, URL_VOOS.replace("BHZ", "SAO"))).datas.length, 5);   // outra pagina
});
