// Leitor do Melhores Destinos: transforma a pagina renderizada em ofertas.
//
// Dois tipos de pagina:
//  - LISTA (home, /promocao, listagens): cada card e um link para
//    /promocao/<slug> com o titulo num <h2> (ou .titulo-loop) e a data em
//    .card-data-novo. Calibrado com o HAR da home de 30/10/2026. A agencia e a
//    que o titulo cita ("Voos diretos da Latam...").
//  - POST (/promocao/<slug>): os links de compra para as agencias, com o preco
//    mais proximo de cada um. AINDA NAO CALIBRADO com um post real: le links
//    externos cujo dominio esta no catalogo, inclusive dentro de redirect de
//    afiliado (?url=https%3A%2F%2Fwww.cvc.com.br...).
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

  const TIPOS = [["pacote", /pacote/i], ["hotel", /hot[eé]is|hotel|hospedage|resort/i], ["cruzeiro", /cruzeiro/i],
                 ["carro", /aluguel de carro|carros?\b/i], ["passagem", /voos?|passage|a[eé]rea|ida e volta/i]];
  const tipoDe = (titulo) => (TIPOS.find(([, re]) => re.test(titulo || "")) || ["outro"])[0];

  // Um link e as URLs que ele carrega: a propria e as de parametros que sao URL
  // (redirect de afiliado), ate dois niveis.
  function urlsDe(href, base) {
    const out = [];
    const visita = (s, nivel) => {
      let u;
      try { u = new URL(s, base || "https://www.melhoresdestinos.com.br/"); } catch (e) { return; }
      out.push(u);
      if (nivel >= 2) return;
      for (const v of u.searchParams.values()) if (/^https?:\/\//i.test(v)) visita(v, nivel + 1);
    };
    visita(href, 0);
    return out;
  }

  // Agencia de um link de compra: pelo dominio (dele ou do redirect).
  function agenciaDoLink(href, base) {
    for (const u of urlsDe(href, base)) {
      const a = C.porHost(u.hostname);
      if (a) return a;
    }
    return null;
  }

  const limpa = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const resumoAg = (a) => ({ id: a.id, rotulo: a.rotulo, cor: a.cor || null });

  function tipoDePagina(url) {
    let u; try { u = new URL(url); } catch (e) { return "outra"; }
    return /^\/promocao\/[^/]+\/?$/.test(u.pathname) ? "post" : "lista";
  }

  // ---- LISTA -------------------------------------------------------------- #
  function lerLista(doc) {
    const vistos = new Set(), ofertas = [];
    for (const a of doc.querySelectorAll('a[href*="/promocao/"]')) {
      const href = a.href || a.getAttribute("href");
      if (!/\/promocao\/[^/?#]+/.test(href) || vistos.has(href)) continue;
      const tEl = a.querySelector("h2, h3, .titulo-loop");
      const titulo = limpa(tEl ? tEl.textContent : a.textContent);
      if (!titulo) continue;
      vistos.add(href);
      const dEl = a.querySelector(".card-data-novo, .card-data");
      // agencia e preco lidos do titulo original; o que fica guardado e o
      // titulo mascarado (so a CVC com nome real)
      ofertas.push({
        titulo: C.mascara(titulo), href, preco: precoDe(titulo), tipo: tipoDe(titulo),
        quando: dEl ? limpa(dEl.textContent) : null,
        agencias: C.noTexto(titulo).map(resumoAg),
        origem: "card",
      });
    }
    return ofertas;
  }

  // ---- POST --------------------------------------------------------------- #
  // Preco mais proximo de um link: o primeiro "R$" no menor bloco ao redor
  // dele (subindo ate 4 niveis) que tenha um preco.
  function precoPerto(el) {
    let no = el;
    for (let i = 0; i < 5 && no; i++, no = no.parentElement) {
      const p = precoDe(no.textContent);
      if (p != null) return p;
    }
    return null;
  }

  // dominios que nunca sao venda (redes, anuncios, o proprio site e parceiros de conteudo)
  const IGNORA = /(^|\.)(melhoresdestinos\.com\.br|melhorescartoes\.com\.br|melhores\.la|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|t\.me|whatsapp\.com|google\.[a-z.]+|doubleclick\.net|adjust\.com|apple\.com|metropoles\.com)$/i;

  function lerPost(doc, url) {
    const raiz = doc.querySelector("article, .entry-content, .post-content, main") || doc.body;
    const h1 = doc.querySelector("h1");
    const titulo = limpa(h1 ? h1.textContent : doc.title);
    const ofertas = [], desconhecidos = new Map(), vistos = new Set();
    for (const a of raiz.querySelectorAll("a[href]")) {
      const href = a.href || a.getAttribute("href");
      const urls = urlsDe(href, url);
      const externos = urls.filter((u) => !IGNORA.test(u.hostname));
      if (!externos.length) continue;
      const ag = agenciaDoLink(href, url);
      if (!ag) {
        for (const u of externos) desconhecidos.set(u.hostname, (desconhecidos.get(u.hostname) || 0) + 1);
        continue;
      }
      const preco = precoPerto(a);
      const chave = `${ag.id}|${preco}|${href}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      ofertas.push({ titulo: C.mascara(titulo), texto: C.mascara(limpa(a.textContent).slice(0, 120)), href, preco,
                     tipo: tipoDe(titulo), agencias: [resumoAg(ag)], origem: "link" });
    }
    // "Resumo da oferta: ✅ Preço: a partir de R$ 1.088" (pacotes)
    const resumo = /Pre[cç]o:\s*a partir de\s*(R\$\s*[\d.,]+)/i.exec(raiz.textContent || "");
    return { titulo: C.mascara(titulo), ofertas, preco_resumo: resumo ? precoDe(resumo[1]) : null,
             desconhecidos: [...desconhecidos].map(([host, n]) => ({ host, n })).sort((x, y) => y.n - x.n) };
  }

  // ---- resumo da pagina --------------------------------------------------- #
  // Quantas ofertas cada um tem e o menor preco; comparativo da CVC com cada
  // player: (CVC - player) / player, a mesma conta do Metabuscadores.
  function resumo(ofertas) {
    const por = new Map();
    let semAgencia = 0;
    for (const o of ofertas) {
      if (!o.agencias.length) { semAgencia += 1; continue; }
      for (const a of o.agencias) {
        const d = por.get(a.id) || Object.assign({ ofertas: 0, menor: null }, a);
        d.ofertas += 1;
        if (o.preco != null && (d.menor == null || o.preco < d.menor)) d.menor = o.preco;
        por.set(a.id, d);
      }
    }
    const lista = [...por.values()].sort((x, y) => (y.ofertas - x.ofertas) || ((x.menor ?? Infinity) - (y.menor ?? Infinity)));
    const cvc = por.get("cvc") || null;
    const comparativo = lista.filter((d) => d.id !== "cvc").map((d) => ({
      id: d.id, rotulo: d.rotulo, cor: d.cor, menor: d.menor,
      dif: cvc && cvc.menor != null && d.menor ? (cvc.menor - d.menor) / d.menor * 100 : null,
    }));
    return { total: ofertas.length, semAgencia, cvc_ofertas: cvc ? cvc.ofertas : 0, cvc_menor: cvc ? cvc.menor : null,
             concorrentes_ofertas: lista.filter((d) => d.id !== "cvc").reduce((s, d) => s + d.ofertas, 0),
             por_agencia: lista, comparativo };
  }

  return { precoDe, tipoDe, urlsDe, agenciaDoLink, tipoDePagina, lerLista, lerPost, resumo };
})();

if (typeof module !== "undefined") module.exports = LEITOR;   // para os testes
