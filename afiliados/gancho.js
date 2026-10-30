// Gancho (mundo MAIN, document_start) na pagina "ver datas" do Melhores
// Destinos (/voos?rota=...). Copia a resposta de /passagens_json/ que a
// PROPRIA pagina pediu (ao abrir e ao clicar num mes) e repassa ao coletor por
// postMessage. Nao faz requisicao nenhuma e nao altera nada da pagina.
(() => {
  if (window.__afiliadosGancho) return;
  window.__afiliadosGancho = true;
  const FONTE = "afiliados-cvc";
  const ALVO = /\/passagens_json\//;
  const fila = [];   // o coletor (document_idle) chega depois do primeiro pedido

  const repassa = (url, texto) => {
    const msg = { fonte: FONTE, tipo: "passagens", url: String(url), texto };
    fila.push(msg);
    window.postMessage(msg, location.origin);
  };
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.fonte !== FONTE || e.data.tipo !== "pedir") return;
    for (const m of fila) window.postMessage(m, location.origin);
  });

  const abre = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url) {
    if (ALVO.test(String(url))) {
      this.addEventListener("load", () => {
        try { if (this.status === 200) repassa(url, this.responseText); } catch (e) { /* responseType nao texto */ }
      });
    }
    return abre.apply(this, arguments);
  };

  const busca = window.fetch;
  window.fetch = function (entrada) {
    const p = busca.apply(this, arguments);
    const url = typeof entrada === "string" ? entrada : (entrada && entrada.url) || "";
    if (ALVO.test(url)) p.then((r) => { if (r.ok) r.clone().text().then((t) => repassa(url, t)).catch(() => {}); }).catch(() => {});
    return p;
  };
})();
