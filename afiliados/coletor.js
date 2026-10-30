// Content script (mundo ISOLATED) no Melhores Destinos: le a pagina, publica a
// leitura para o painel em chrome.storage.local ("af_estado") e grava uma linha
// por pagina lida no historico ("afh:..."). Nao faz nenhuma requisicao: so le
// o que o site ja mostrou.
(() => {
  if (window.top !== window || window.__afiliadosCVC) return;
  window.__afiliadosCVC = true;

  function le() {
    const tipo = LEITOR.tipoDePagina(location.href);
    if (tipo === "post") {
      const p = LEITOR.lerPost(document, location.href);
      return { tipo, url: location.href, titulo: p.titulo, ofertas: p.ofertas,
               preco_resumo: p.preco_resumo, desconhecidos: p.desconhecidos };
    }
    return { tipo, url: location.href, titulo: CATALOGO.mascara(document.title), ofertas: LEITOR.lerLista(document), desconhecidos: [] };
  }

  let ultima = "";
  function publica() {
    const l = le();
    l.resumo = LEITOR.resumo(l.ofertas);
    l.quando = new Date().toISOString();
    const assinatura = JSON.stringify([l.url, l.ofertas.length, l.resumo.cvc_ofertas]);
    if (assinatura === ultima) return;   // nada mudou
    ultima = assinatura;
    try {
      chrome.storage.local.set({ af_estado: l }).catch(() => {});
      gravaHistorico(l);
    } catch (e) { /* extensao recarregada por baixo da aba */ }
  }

  // uma linha por pagina por dia: a leitura mais recente substitui a anterior
  function gravaHistorico(l) {
    if (!l.ofertas.length) return;
    const dia = l.quando.slice(0, 10);
    const chave = `afh:${dia}:${l.url.replace(/[?#].*$/, "")}`;
    chrome.storage.local.set({ [chave]: { quando: l.quando, url: l.url, tipo: l.tipo, titulo: l.titulo,
      ofertas: l.ofertas, resumo: l.resumo } }).catch(() => {});
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
  // cards carregados depois (rolagem infinita, "carregar mais"): rele com calma
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(publica, 1500); })
    .observe(document.body, { childList: true, subtree: true });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { ultima = ""; publica(); } });
})();
