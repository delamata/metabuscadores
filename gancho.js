// Roda no MAIN world (mesmo mundo do JS do Skyscanner/Kayak), em document_start.
//
// Por que aqui e nao no webRequest: a API webRequest do MV3 nao entrega o CORPO
// da resposta, so cabecalhos. Quem tem o corpo e a propria pagina.
//
// fetch/XHR sao envolvidos em Proxy, e nao substituidos por funcao nossa, para
// que window.fetch.toString() continue devolvendo "[native code]" — e um dos
// sinais que o antibot olha. A requisicao nao e tocada: nada de header novo,
// nada de reemitir o POST. So lemos um clone da resposta que a pagina ja pediu.
//
// A REGRA DE CAPTURA E POR CONTEUDO, NAO POR URL. A versao anterior exigia
// "POST + url contendo web-unified-search" e pegava so o primeiro poll: medido
// numa busca real, 21 requisicoes de busca passaram e apenas 1 corpo foi lido.
// A continuacao da busca sai por outro path/metodo. Entao agora: toda resposta
// de uma requisicao que PARECE busca e lida, e o que decide e ter "itineraries"
// no corpo — que e o que a analise consome. Endpoint pode mudar; o formato do
// dado e o que importa.
(() => {
  if (window.__capturaCVC) return;
  window.__capturaCVC = true;

  // quem e candidato a ser lido (a leitura e de um clone, nao atrapalha a pagina)
  const INTERESSE = /(search|radar|poll|itiner|flights|conductor|fps)/i;
  const MARCA = '"itineraries"';

  function fala(msg) {
    try {
      window.postMessage(Object.assign({ __capturaCVC: 1 }, msg), window.location.origin);
    } catch (e) { /* pagina fechando; a busca nao depende disso */ }
  }

  // Decide pelo corpo: com itineraries e busca; sem, fica so no diagnostico.
  function julga(corpo, meta) {
    if (corpo && corpo.includes(MARCA)) fala(Object.assign({ tipo: "vitrine", corpo }, meta));
    else fala(Object.assign({ tipo: "visto", bytes: corpo ? corpo.length : 0 }, meta));
  }

  const fetchNativo = window.fetch;
  window.fetch = new Proxy(fetchNativo, {
    apply(alvo, self, args) {
      const t0 = Date.now();
      const req = args[0];
      const url = typeof req === "string" ? req : (req && req.url) || "";
      const metodo = ((args[1] && args[1].method) || (req && req.method) || "GET").toUpperCase();
      const p = Reflect.apply(alvo, self, args);
      if (!INTERESSE.test(url)) return p;
      return p.then((resp) => {
        const meta = { url, metodo, status: resp.status, t0, t1: Date.now(), origem: "fetch" };
        const tipo = resp.headers.get("content-type") || "";
        if (tipo && !tipo.includes("json") && !tipo.includes("text")) {
          fala(Object.assign({ tipo: "visto", bytes: 0 }, meta));
          return resp;
        }
        resp.clone().text()
          .then((corpo) => julga(corpo, meta))
          .catch((e) => fala({ tipo: "falha", url, erro: String(e).slice(0, 200) }));
        return resp;
      });
    },
  });

  const XHR = window.XMLHttpRequest.prototype;
  XHR.open = new Proxy(XHR.open, {
    apply(alvo, self, args) {
      self.__cvcMetodo = String(args[0] || "").toUpperCase();
      self.__cvcUrl = String(args[1] || "");
      return Reflect.apply(alvo, self, args);
    },
  });
  XHR.send = new Proxy(XHR.send, {
    apply(alvo, self, args) {
      const t0 = Date.now();
      self.addEventListener("load", () => {
        try {
          const url = self.__cvcUrl || "";
          if (!INTERESSE.test(url)) return;
          const meta = { url, metodo: self.__cvcMetodo, status: self.status,
                         t0, t1: Date.now(), origem: "xhr" };
          const tipo = self.responseType;
          let corpo = null;
          if (tipo === "" || tipo === "text") corpo = self.responseText;
          else if (tipo === "json") corpo = JSON.stringify(self.response);
          if (corpo === null) {
            fala(Object.assign({ tipo: "visto", bytes: 0, nota: `responseType=${tipo}` }, meta));
            return;
          }
          julga(corpo, meta);
        } catch (e) { /* idem */ }
      });
      return Reflect.apply(alvo, self, args);
    },
  });

  // ---- diagnostico: quem mais poderia estar buscando ---------------------- #
  // Um content script NAO alcanca o interior de um Web Worker nem do service
  // worker do site. Ja sabemos que nao e o caso aqui (as requisicoes aparecem
  // nesta thread), mas a deteccao fica: e barata e responde a pergunta na hora.
  if (window.Worker) {
    window.Worker = new Proxy(window.Worker, {
      construct(alvo, args) {
        fala({ tipo: "worker", url: String(args[0] || "").slice(0, 300) });
        return new alvo(...args);
      },
    });
  }
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations()
      .then((rs) => fala({ tipo: "sw", escopos: rs.map((r) => r.scope) }))
      .catch(() => {});
  }
})();
