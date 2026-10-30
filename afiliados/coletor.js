// Content script (mundo ISOLATED) no post de promocao do Melhores Destinos e na
// pagina "ver datas" de um trecho: le, publica a leitura para o painel em chrome.storage.local ("af_estado") e grava uma linha
// por pagina lida no historico ("afh:..."). Nao faz nenhuma requisicao: so le
// o que o site ja mostrou.
(() => {
  if (window.top !== window || window.__afiliadosCVC) return;
  window.__afiliadosCVC = true;

  // So o post de promocao. Com a tabela filtrada (origem/destino escolhidos
  // pelo usuario) a leitura nao e a promocao inteira: fica a anterior.
  let ultima = "";
  function publica() {
    if (!LEITOR.ehPromo(location.href)) return;
    const l = Object.assign({ pagina: "post" }, LEITOR.lerPost(document, location.href));
    if (l.filtrada) return;
    l.resumo = LEITOR.resumo(l);
    l.quando = new Date().toISOString();
    const assinatura = JSON.stringify([l.url, l.trechos.length, l.resumo.menor, l.vendedores.lista.map((v) => v.codigo)]);
    if (assinatura === ultima) return;   // nada mudou
    ultima = assinatura;
    try {
      chrome.storage.local.set({ af_estado: l }).catch(() => {});
      gravaHistorico(l);
    } catch (e) { /* extensao recarregada por baixo da aba */ }
  }

  // uma linha por post por dia: a leitura mais recente substitui a anterior
  function gravaHistorico(l) {
    if (!l.trechos.length && !l.vendedores.lista.length) return;
    const dia = l.quando.slice(0, 10);
    const chave = `afh:${dia}:${l.url.replace(/[?#].*$/, "")}`;
    chrome.storage.local.set({ [chave]: { quando: l.quando, url: l.url, titulo: l.titulo, tipo: l.tipo,
      vendedores: l.vendedores, citacoes: l.citacoes, trechos: l.trechos, resumo: l.resumo } }).catch(() => {});
  }

  // ---- pagina "ver datas" (/voos?rota=...) ---------------------------------- #
  // Os precos com vendedor chegam pelo gancho (mundo MAIN), um mes por resposta.
  let voos = null;
  function publicaVoos(json) {
    let l;
    try { l = LEITOR.lerVoos(json, location.href); } catch (e) { return; }
    registraVoos(l);
  }
  function registraVoos(l) {
    voos = LEITOR.juntaVoos(voos, l);
    const estado = Object.assign({ pagina: "voos", quando: new Date().toISOString() }, voos);
    estado.resumo = LEITOR.resumoVoos(estado);
    delete estado.resumo.ordenadas;   // o painel reordena; nao precisa gravar duas vezes
    try {
      chrome.storage.local.set({ af_estado: estado }).catch(() => {});
      if (estado.datas.length) {
        const chave = `afv:${estado.quando.slice(0, 10)}:${estado.de}-${estado.para}:${estado.chave}`;
        chrome.storage.local.set({ [chave]: { quando: estado.quando, url: estado.url, slug: estado.slug, post_url: estado.post_url,
          de: estado.de, para: estado.para, de_nome: estado.de_nome, para_nome: estado.para_nome,
          vendedores: estado.vendedores, datas: estado.datas, resumo: estado.resumo } }).catch(() => {});
      }
    } catch (e) { /* extensao recarregada por baixo da aba */ }
  }
  if (LEITOR.ehVoos(location.href)) {
    window.addEventListener("message", (e) => {
      const m = e.data;
      if (e.source !== window || !m || m.fonte !== "afiliados-cvc" || m.tipo !== "passagens") return;
      let json; try { json = JSON.parse(m.texto); } catch (err) { return; }
      if (json && typeof json === "object") publicaVoos(json);
    });
    window.postMessage({ fonte: "afiliados-cvc", tipo: "pedir" }, location.origin);   // o que chegou antes de nos
  }

  // Pedido do painel: baixa o HTML da pagina como esta agora, para calibrar o
  // leitor com a pagina real.
  chrome.runtime.onMessage.addListener((msg, _rem, responde) => {
    if (!msg || msg.tipo !== "af-baixar") return false;
    const blob = new Blob(["<!doctype html>\n" + document.documentElement.outerHTML], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `afiliados-pagina-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.html`;
    document.documentElement.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    responde({ ok: true });
    return false;
  });

  publica();
  // a tabela de trechos chega depois (o site busca os precos): rele com calma
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(publica, 1500); })
    .observe(document.body, { childList: true, subtree: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (voos) { const v = voos; voos = null; registraVoos(v); } else { ultima = ""; publica(); }
  });
})();
