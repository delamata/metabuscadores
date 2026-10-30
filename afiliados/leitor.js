// Leitor do Melhores Destinos: so o POST DE PROMOCAO (/promocao/<slug>).
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
    const lista = codigos.map((codigo) => {
      const a = C.noTexto(codigo)[0];
      return Object.assign(a ? resumoAg(a) : { id: `?${codigo}`, rotulo: "Player ?", cor: null },
                           { codigo, primeiro: codigo === primeiro });
    });
    return { lista, primeiro: lista.find((v) => v.primeiro) || null, cvc: lista.some((v) => v.id === "cvc"),
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

  return { precoDe, ehPromo, dadosDaPromo, abrePrimeiro, vendedores, lerTrechos, filtrada, lerPost, resumo };
})();

if (typeof module !== "undefined") module.exports = LEITOR;   // para os testes
