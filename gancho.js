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
// de uma requisicao que PARECE busca e lida, e o que decide e a marca no corpo.
// Endpoint pode mudar; o formato do dado e o que importa.
//
// WEB WORKERS. O Kayak faz o poll da busca DENTRO de Web Workers criados a
// partir de blob: (medido em 2026-10-17: a pagina fez 24 requisicoes, nenhuma
// de busca, e criou 2 workers blob:). O gancho da pagina nao ve o fetch de
// dentro de um worker. Por isso o MESMO gancho e instalado no worker: quando a
// pagina cria o worker a partir de um Blob nosso conhecido, o worker nasce de
// um Blob novo = [gancho] + [Blob original]. E o mesmo codigo do site, na mesma
// origem e sob a mesma CSP — nada de importScripts nem eval. O worker devolve
// o que viu por BroadcastChannel, e esta pagina repassa ao coletor.
(() => {
  if (window.__capturaCVC) return;
  window.__capturaCVC = true;

  const CANAL = "__capturaCVC";
  // BroadcastChannel alcanca TODAS as abas da origem: o id separa a nossa
  const ID_PAGINA = Math.random().toString(36).slice(2);

  // Gancho de fetch/XHR. Roda na pagina e, serializado, dentro dos workers:
  // por isso nao pode usar nada de fora dele mesmo.
  function instala(escopo, fala, origem) {
    // quem e candidato a ser lido (a leitura e de um clone, nao atrapalha)
    // "/i/api/" e o prefixo das APIs internas do Kayak
    const INTERESSE = /(search|radar|poll|itiner|flights|conductor|fps|\/i\/api\/)/i;
    // Skyscanner traz "itineraries"; o Kayak traz os precos por agencia em
    // bookingOptions/optionsByFare com providerInfo. Qualquer uma basta.
    const MARCAS = ['"itineraries"', '"bookingOptions"', '"optionsByFare"', '"providerInfo"'];
    // corpo JSON grande sem marca vai junto no "visto", para a amostra que o
    // painel deixa baixar: e assim que se descobre um formato novo com dado real
    const AMOSTRA_MIN = 5000, AMOSTRA_MAX = 20e6;

    // Decide pelo corpo: com uma das marcas e busca; sem, fica so no diagnostico.
    function julga(corpo, meta) {
      if (corpo && MARCAS.some((m) => corpo.includes(m))) {
        fala(Object.assign({ tipo: "vitrine", corpo }, meta));
        return;
      }
      const n = corpo ? corpo.length : 0;
      const amostra = n >= AMOSTRA_MIN && n <= AMOSTRA_MAX && /^\s*[[{]/.test(corpo) ? corpo : undefined;
      fala(Object.assign({ tipo: "visto", bytes: n, amostra }, meta));
    }

    if (escopo.fetch) {
      escopo.fetch = new Proxy(escopo.fetch, {
        apply(alvo, self, args) {
          const t0 = Date.now();
          const req = args[0];
          const url = typeof req === "string" ? req : (req && req.url) || String(req || "");
          const metodo = ((args[1] && args[1].method) || (req && req.method) || "GET").toUpperCase();
          const p = Reflect.apply(alvo, self, args);
          if (!INTERESSE.test(url)) return p;
          return p.then((resp) => {
            const meta = { url, metodo, status: resp.status, t0, t1: Date.now(), origem: `${origem}fetch` };
            const tipo = resp.headers.get("content-type") || "";
            if (tipo && !tipo.includes("json") && !tipo.includes("text")) {
              fala(Object.assign({ tipo: "visto", bytes: 0, nota: tipo.slice(0, 40) }, meta));
              return resp;
            }
            resp.clone().text()
              .then((corpo) => julga(corpo, meta))
              .catch((e) => fala({ tipo: "falha", url, erro: String(e).slice(0, 200) }));
            return resp;
          });
        },
      });
    }

    if (escopo.XMLHttpRequest) {
      const XHR = escopo.XMLHttpRequest.prototype;
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
                             t0, t1: Date.now(), origem: `${origem}xhr` };
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
    }
  }

  function fala(msg) {
    try {
      window.postMessage(Object.assign({ __capturaCVC: 1 }, msg), window.location.origin);
    } catch (e) { /* pagina fechando; a busca nao depende disso */ }
  }

  instala(window, fala, "");

  // ---- workers --------------------------------------------------------------- #
  // Repasse: o que os workers desta aba virem chega aqui e vai para o coletor.
  try {
    const bc = new BroadcastChannel(CANAL);
    bc.onmessage = (ev) => {
      const d = ev.data;
      if (d && d.__pagina === ID_PAGINA) { delete d.__pagina; fala(d); }
    };
  } catch (e) { /* sem BroadcastChannel: fica so o gancho da pagina */ }

  // Codigo que abre o worker: o gancho + o fala por BroadcastChannel.
  const prefixo = `;(function(){try{var bc=new BroadcastChannel(${JSON.stringify(CANAL)});`
    + `(${instala.toString()})(self,function(m){try{m.__pagina=${JSON.stringify(ID_PAGINA)};`
    + `bc.postMessage(m)}catch(e){}},"worker-")}catch(e){}})();\n`;

  // Lembra os Blobs de script que a pagina transforma em URL, para reconhecer
  // o Blob na hora em que vira worker. So os de script, e no maximo 50.
  const criaUrl = URL.createObjectURL;
  const blobs = new Map();
  URL.createObjectURL = new Proxy(criaUrl, {
    apply(alvo, self, args) {
      const url = Reflect.apply(alvo, self, args);
      const b = args[0];
      try {
        if (b instanceof Blob && (!b.type || /javascript|ecmascript/i.test(b.type))) {
          blobs.set(url, b);
          if (blobs.size > 50) blobs.delete(blobs.keys().next().value);
        }
      } catch (e) { /* so diagnostico */ }
      return url;
    },
  });

  if (window.Worker) {
    window.Worker = new Proxy(window.Worker, {
      construct(alvo, args) {
        const original = String(args[0] || "");
        const b = blobs.get(original);
        let injetado = false;
        if (b) {
          try {
            const novo = new Blob([prefixo, b], { type: b.type || "text/javascript" });
            args = [Reflect.apply(criaUrl, URL, [novo]), ...args.slice(1)];
            injetado = true;
          } catch (e) { args = [original, ...args.slice(1)]; }
        }
        fala({ tipo: "worker", url: original.slice(0, 300), injetado });
        try {
          return new alvo(...args);
        } catch (e) {
          // se a versao com gancho nao subir, o site nao pode pagar por isso
          if (!injetado) throw e;
          return new alvo(original, ...args.slice(1));
        }
      },
    });
  }

  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations()
      .then((rs) => fala({ tipo: "sw", escopos: rs.map((r) => r.scope) }))
      .catch(() => {});
  }
})();
