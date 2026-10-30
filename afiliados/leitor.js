// Leitor do Melhores Destinos: o POST DE PROMOCAO (/promocao/<slug>) e a pagina
// "ver datas" de um trecho dele (/voos?rota=...), que traz o vendedor de cada preco.
// Calibrado com o HAR do post "Parques da Florida" de 30/10/2026.
//
// O que o post traz (e o que o leitor usa):
//  - <script> com `var promo = {...}` / `var publication_json = {...}`: a chave
//    da promocao e os vendedores do buscador do post
//    (search_engine_configuration.providers, ex. ["viajanet","latam","decolar","gol","cvc"]).
//  - a tabela de trechos que o proprio site monta (listagem-passagens-trechos.js):
//    <div class="ls-trechos-linha" from to from_name to_name> com o preco em .lt2.
//    E o menor preco de cada trecho, SEM o nome do vendedor.
//  - o botao "Pesquisar" do buscador abre UM vendedor, pela prioridade fixa do
//    site (motor-post-passagensaereas.js): decolar > latam > cvc > viajanet > gol.
//
// So a CVC aparece com o nome real; as demais pelo rotulo "Player N".
var LEITOR = (() => {
  const C = typeof CATALOGO !== "undefined" ? CATALOGO : require("./catalogo.js");

  // "R$ 2.341", "R$ 1.088,90" -> numero. Primeiro preco do texto.
  function precoDe(texto) {
    const m = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/.exec(texto || "");
    if (!m) return null;
    return Number(m[1].replace(/\./g, "")) + (m[2] ? Number(m[2]) / 100 : 0);
  }

  const limpa = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const resumoAg = (a) => ({ id: a.id, rotulo: a.rotulo, cor: a.cor || null });

  function ehPromo(url) {
    let u; try { u = new URL(url); } catch (e) { return false; }
    return /^\/promocao\/[^/]+\/?$/.test(u.pathname);
  }

  // `var promo = {...};` dos <script> inline. O conteudo e JSON numa linha so.
  function dadosDaPromo(textos) {
    for (const nome of ["promo", "publication_json"]) {
      const re = new RegExp(`var\\s+${nome}\\s*=\\s*(\\{.*\\})\\s*;`);
      for (const t of textos) {
        const m = re.exec(t || "");
        if (!m) continue;
        try { return JSON.parse(m[1]); } catch (e) { /* tenta o proximo */ }
      }
    }
    return null;
  }

  // Ordem em que o botao do buscador escolhe o vendedor (motor-post-passagensaereas.js)
  const PRIORIDADE = ["decolar", "latam", "cvc", "viajanet", "gol"];
  function abrePrimeiro(codigos) {
    return PRIORIDADE.find((c) => codigos.includes(c)) || "decolar";   // padrao do site: decolar
  }

  // Vendedores do buscador do post, na ordem do site. Codigo fora do catalogo
  // fica como "Player ?" (o codigo cru so aparece no Diagnostico).
  function vendedores(promo) {
    const codigos = ((promo && promo.search_engine_configuration && promo.search_engine_configuration.providers) || [])
      .map((c) => String(c).toLowerCase());
    const primeiro = codigos.length ? abrePrimeiro(codigos) : null;
    // vez no botao: a ordem da PRIORIDADE entre os que estao no post (fora dela: sem vez)
    const naFila = PRIORIDADE.filter((c) => codigos.includes(c));
    const lista = codigos.map((codigo, i) => {
      const a = C.noTexto(codigo)[0];
      const vez = naFila.indexOf(codigo);
      return Object.assign(a ? resumoAg(a) : { id: `?${codigo}`, rotulo: "Player ?", cor: null },
                           { codigo, primeiro: codigo === primeiro, posicao: i + 1, vez_botao: vez < 0 ? null : vez + 1 });
    });
    const cvc = lista.find((v) => v.id === "cvc") || null;
    return { lista, primeiro: lista.find((v) => v.primeiro) || null, cvc: !!cvc,
             cvc_posicao: cvc ? cvc.posicao : null, cvc_vez_botao: cvc ? cvc.vez_botao : null,
             // quem o botao escolheria antes da CVC
             antes_da_cvc: cvc && cvc.vez_botao ? lista.filter((v) => v.vez_botao && v.vez_botao < cvc.vez_botao)
               .sort((a, b) => a.vez_botao - b.vez_botao).map((v) => v.rotulo) : [],
             desconhecidos: lista.filter((v) => v.id.startsWith("?")).map((v) => v.codigo) };
  }

  // Tabela de trechos renderizada pelo site. Pacotes usam a mesma linha.
  function lerTrechos(doc) {
    return [...doc.querySelectorAll(".ls-trechos-linha")].map((l) => {
      const cel = (k) => limpa((l.querySelector(k) || {}).textContent);
      const txt = cel(".lt2");
      return {
        origem: l.getAttribute("from_name") || cel(".lt0"), origem_cod: l.getAttribute("from") || "",
        destino: l.getAttribute("to_name") || cel(".lt1"), destino_cod: l.getAttribute("to") || "",
        preco: precoDe(txt), texto: txt,
      };
    });
  }

  // A tabela tem filtros de origem/destino; filtrada, ela nao e a promocao inteira.
  function filtrada(doc) {
    const o = doc.getElementById("filtro-origem"), d = doc.getElementById("filtro-destino");
    return !!((o && o.value && o.value !== "Todas") || (d && d.value && d.value !== "Todos"));
  }

  function lerPost(doc, url) {
    const h1 = doc.querySelector("h1.h1post, h1");
    const tituloOriginal = limpa(h1 ? h1.textContent : doc.title);
    const promo = dadosDaPromo([...doc.querySelectorAll("script:not([src])")].map((s) => s.textContent));
    return {
      url, titulo: C.mascara(tituloOriginal), preco_titulo: precoDe(tituloOriginal),
      tem_promo: !!promo, tem_precos: !!(promo && promo.has_prices), ativa: promo ? promo.active !== false : null,
      tipo: promo && promo.publication_type === "packages" ? "pacote" : "passagem",
      ida_e_volta: promo ? /Roundtrip/i.test(promo.itinerary_price_type || "") : null,
      vendedores: vendedores(promo), trechos: lerTrechos(doc), filtrada: filtrada(doc),
    };
  }

  // Menor/maior por grupo (destino ou origem), do mais barato para o mais caro
  function porGrupo(trechos, campo) {
    const m = new Map();
    for (const t of trechos) {
      const g = m.get(t[campo]) || { nome: t[campo], n: 0, menor: null, maior: null };
      g.n += 1;
      if (t.preco != null) {
        if (g.menor == null || t.preco < g.menor) g.menor = t.preco;
        if (g.maior == null || t.preco > g.maior) g.maior = t.preco;
      }
      m.set(t[campo], g);
    }
    return [...m.values()].sort((a, b) => (a.menor ?? Infinity) - (b.menor ?? Infinity));
  }

  function resumo(post) {
    const precos = post.trechos.map((t) => t.preco).filter((p) => p != null).sort((a, b) => a - b);
    const meio = precos.length >> 1;
    return {
      trechos: post.trechos.length, com_preco: precos.length,
      menor: precos.length ? precos[0] : null, maior: precos.length ? precos[precos.length - 1] : null,
      mediana: precos.length ? (precos.length % 2 ? precos[meio] : (precos[meio - 1] + precos[meio]) / 2) : null,
      origens: new Set(post.trechos.map((t) => t.origem)).size,
      por_destino: porGrupo(post.trechos, "destino"), por_origem: porGrupo(post.trechos, "origem"),
    };
  }

  // ---- pagina "ver datas" (/voos?rota=DE/PARA/chave) ---------------------- #
  // A resposta de /passagens_json/ (copiada pelo gancho) traz, para o mes
  // carregado, cada par de datas com o preco e o VENDEDOR (provider_name).
  // Calibrado com o HAR de BHZ -> TPA de 30/10/2026.
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const chaveMes = (m) => `${m.year}-${String(MESES.indexOf(m.month) + 1).padStart(2, "0")}`;
  // cia aerea pelo codigo IATA: as do catalogo viram Player N; as demais ficam pelo codigo
  const CIAS = { G3: "p10", LA: "p11", JJ: "p11", AD: "p9" };

  function ehVoos(url) {
    let u; try { u = new URL(url); } catch (e) { return false; }
    return /^\/voos\/?$/.test(u.pathname) && u.searchParams.has("rota");
  }

  // vendedor de uma data: pelo nome; se nao bater, pelo dominio do link
  function vendedorDe(nome, link) {
    let a = C.noTexto(nome)[0];
    if (!a && link) { try { a = C.porHost(new URL(link).hostname); } catch (e) { /* link ruim */ } }
    return a ? resumoAg(a) : { id: "?", rotulo: "Player ?", cor: null };
  }

  function lerVoos(json, urlPagina) {
    const u = new URL(urlPagina);
    const [de, para, chave] = (u.searchParams.get("rota") || "").split("/");
    const slug = (u.searchParams.get("slug_post") || "").replace(/__\d+$/, "");
    const meses = (json.months || []).map((m) => ({ mes: chaveMes(m), rotulo: `${m.month}/${m.year}`, preco: m.price ?? null,
                                                    mais_barato: !!m.cheapest }));
    const datas = [], desconhecidos = new Set();
    for (const m of json.months || []) {
      for (const d of m.dates || []) {
        const v = vendedorDe(d.provider_name, d.link);
        if (v.id === "?") desconhecidos.add(String(d.provider_name || ""));
        const cia = CIAS[d.airline_code] ? C.porId(CIAS[d.airline_code]).rotulo : (d.airline_code || "");
        datas.push({ mes: chaveMes(m), ida: d.departure, ida_dia: d.departure_txt, volta: d.arrival || "", volta_dia: d.arrival_txt || "",
                     estadia: d.stay ?? null, preco: typeof d.price === "number" ? d.price : precoDe(`R$ ${d.price}`),
                     vendedor: v, cia, bagagem: d.luggage_type || "" });
      }
    }
    return { url: urlPagina, de, para, chave, slug, post_url: json.publication_url || "",
             de_nome: json.from_city_name || de, para_nome: json.to_city_name || para,
             ida_e_volta: /Roundtrip/i.test(json.itinerary_price_type || ""),
             vendedores: vendedores(json), meses, datas, desconhecidos: [...desconhecidos] };
  }

  // Junta a leitura nova com as dos meses ja vistos nesta pagina (cada clique
  // num mes traz so aquele mes): as datas de um mes recarregado substituem as antigas.
  function juntaVoos(antes, nova) {
    if (!antes || antes.url !== nova.url) return nova;
    const novos = new Set(nova.datas.map((d) => d.mes));
    return Object.assign({}, nova, { meses: nova.meses.length ? nova.meses : antes.meses,
      datas: antes.datas.filter((d) => !novos.has(d.mes)).concat(nova.datas),
      desconhecidos: [...new Set(antes.desconhecidos.concat(nova.desconhecidos))] });
  }

  // Ranking pela ordem padrao do site (preco; empate fica na ordem do site).
  // Comparativo como no Metabuscadores: (CVC - player) / player.
  function resumoVoos(l) {
    const lista = l.datas.map((d, i) => [d, i]).sort((a, b) => (a[0].preco - b[0].preco) || (a[1] - b[1])).map(([d]) => d);
    const por = new Map();
    for (const d of lista) {
      const g = por.get(d.vendedor.id) || Object.assign({ datas: 0, menor: null }, d.vendedor);
      g.datas += 1;
      if (d.preco != null && (g.menor == null || d.preco < g.menor)) g.menor = d.preco;
      por.set(d.vendedor.id, g);
    }
    const ranking = [...por.values()].sort((a, b) => (a.menor ?? Infinity) - (b.menor ?? Infinity));
    const cvc = por.get("cvc") || null;
    const pos = lista.findIndex((d) => d.vendedor.id === "cvc");
    return {
      datas: lista.length, menor: lista.length ? lista[0].preco : null, mais_barato: lista.length ? lista[0].vendedor : null,
      meses_lidos: [...new Set(lista.map((d) => d.mes))].sort(),
      cvc_datas: cvc ? cvc.datas : 0, cvc_menor: cvc ? cvc.menor : null,
      cvc_lugar_preco: cvc ? ranking.indexOf(cvc) + 1 : null,           // entre os vendedores
      cvc_posicao_lista: pos < 0 ? null : pos + 1,                     // 1a oferta da CVC na lista do site
      vendedores: ranking.length, por_vendedor: ranking, ordenadas: lista,
      comparativo: ranking.filter((g) => g.id !== "cvc").map((g) => ({ id: g.id, rotulo: g.rotulo, cor: g.cor, menor: g.menor, datas: g.datas,
        dif: cvc && cvc.menor != null && g.menor ? (cvc.menor - g.menor) / g.menor * 100 : null })),
    };
  }

  return { precoDe, ehPromo, dadosDaPromo, abrePrimeiro, vendedores, lerTrechos, filtrada, lerPost, resumo,
           ehVoos, vendedorDe, lerVoos, juntaVoos, resumoVoos };
})();

if (typeof module !== "undefined") module.exports = LEITOR;   // para os testes
