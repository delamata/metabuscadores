// Rotina automatica: busca uma lista de rotas no Kayak em horarios fixos.
//
// Logica pura (sem chrome.*), usada pelo service worker, pelo painel, pelo
// relatorio e pelos testes. Quem executa e o servico.js.
//
// O QUE A ROTINA FAZ E O QUE NAO FAZ: abre as rotas, uma por vez, no Chrome de
// quem usa o addon, como uma pessoa abriria o link — mesmo navegador, mesma
// sessao, poucas paginas por dia. Nao disfarca o navegador, nao imita
// comportamento humano e nao contorna verificacao: se o site pedir
// verificacao de robo, a rodada PARA e avisa.
var ROTINA = (() => {
  const PADRAO = {
    ativa: true,
    horarios: [9, 15, 21],                      // hora local do computador
    rotas: ["SAO-RIO", "SAO-SSA", "SAO-MCZ", "SAO-FOR", "SAO-REC"],
    dias_ida: 30,                               // ida daqui a N dias
    noites: 7,                                  // volta N dias depois da ida (0 = so ida)
    adultos: 1,
    espaco_s: 60,                               // pausa entre uma rota e a proxima
    limite_s: 300,                              // tempo maximo esperando a analise de uma rota
  };

  function config(salva) {
    const c = Object.assign({}, PADRAO, salva || {});
    c.horarios = [...new Set((c.horarios || []).map(Number).filter((h) => h >= 0 && h <= 23))].sort((a, b) => a - b);
    c.rotas = (c.rotas || []).map((r) => String(r).trim().toUpperCase()).filter(rotaValida);
    return c;
  }

  const rotaValida = (r) => /^[A-Z]{3}-[A-Z]{3}$/.test(r);

  const pad = (n) => String(n).padStart(2, "0");
  const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const maisDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // Datas da busca a partir de "agora": ida em +dias_ida, volta +noites.
  function datas(c, agora) {
    const ida = maisDias(agora, c.dias_ida);
    return { ida: isoLocal(ida), volta: c.noites > 0 ? isoLocal(maisDias(ida, c.noites)) : null };
  }

  // Mesmo formato de URL que o analise.js le (cfgKayak).
  function urlKayak(rota, ida, volta, adultos) {
    const adt = adultos > 1 ? `/${adultos}adults` : "";
    return `https://www.kayak.com.br/flights/${rota}/${ida}${volta ? `/${volta}` : ""}${adt}?sort=bestflight_a`;
  }

  // Fila de uma rodada: uma entrada por rota, todas pendentes.
  function fila(c, agora) {
    const { ida, volta } = datas(c, agora);
    return c.rotas.map((rota) => ({ rota, ida, volta, url: urlKayak(rota, ida, volta, c.adultos), status: "pendente" }));
  }

  // Proxima vez (hora local) em que o relogio marca `hora`:00.
  function proximo(hora, agora) {
    const d = new Date(agora);
    d.setHours(hora, 0, 0, 0);
    if (d.getTime() <= agora.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }

  const rotuloHorario = (h) => `${pad(h)}h`;

  // Pagina de verificacao de robo / bloqueio: a rodada para aqui.
  const RE_BLOQUEIO = /\/help\/bots|captcha|security[-_]?check|\/challenge|px-captcha|access[-_]denied/i;
  const bloqueio = (url, titulo) => RE_BLOQUEIO.test(url || "") || /captcha|rob[oô]|are you a (human|robot)|verifica[cç][aã]o/i.test(titulo || "");

  // A linha do historico que corresponde a uma entrada da fila: mesma rota e
  // datas, gravada depois que a aba foi aberta.
  function casa(linha, item) {
    return linha && item && linha.rota === item.rota && linha.ida === item.ida
      && (linha.volta || null) === (item.volta || null)
      && Date.parse(linha.quando) >= (item.aberta_em || 0) - 1000;
  }

  // Resumo de uma rodada para a notificacao e o relatorio.
  function resumo(rodada, linhas) {
    const porChave = new Map((linhas || []).map((l) => [l.chave, l]));
    const itens = (rodada.fila || []).map((it) => Object.assign({}, it, { linha: it.chave ? porChave.get(it.chave) : null }));
    const ok = itens.filter((it) => it.linha);
    const comparaveis = ok.filter((it) => it.linha.variacao_pct != null);
    const cvcMaisBarata = comparaveis.filter((it) => it.linha.variacao_pct < 0).length;
    const semCvc = ok.filter((it) => it.linha.preco_cvc == null).length;
    const bloqueada = itens.some((it) => it.status === "bloqueio");
    const falhas = itens.filter((it) => it.status !== "ok").length;
    let texto = `${ok.length} de ${itens.length} rotas lidas.`;
    if (comparaveis.length) texto += ` CVC mais barata que o Player 1 em ${cvcMaisBarata} de ${comparaveis.length}.`;
    if (semCvc) texto += ` CVC sem oferta em ${semCvc}.`;
    if (bloqueada) texto += " O Kayak pediu verificação de robô: rodada interrompida.";
    return { itens, lidas: ok.length, total: itens.length, cvcMaisBarata, comparaveis: comparaveis.length,
             semCvc, falhas, bloqueada, texto };
  }

  // Dados do relatorio a partir das rodadas guardadas e do historico:
  // KPIs do periodo, a ultima rodada rota a rota e a matriz rota x rodada
  // (as `n` rodadas mais recentes) com a linha de cada busca.
  function consolida(rodadas, linhas, n) {
    const porChave = new Map((linhas || []).map((l) => [l.chave, l]));
    const rs = (rodadas || []).filter((r) => r.fim).slice().sort((a, b) => a.inicio - b.inicio);
    const recentes = rs.slice(-(n || 9));
    const rotas = [...new Set(rs.flatMap((r) => r.fila.map((it) => it.rota)))];
    const linhaDe = (it) => (it.chave ? porChave.get(it.chave) || null : null);
    const matriz = rotas.map((rota) => ({
      rota,
      celulas: recentes.map((r) => {
        const it = r.fila.find((x) => x.rota === rota);
        return { rodada: r.id, status: it ? it.status : null, linha: it ? linhaDe(it) : null };
      }),
    }));
    const todas = rs.flatMap((r) => r.fila.map(linhaDe)).filter(Boolean);
    const comparaveis = todas.filter((l) => l.variacao_pct != null);
    const media = comparaveis.length ? comparaveis.reduce((s, l) => s + l.variacao_pct, 0) / comparaveis.length : null;
    const ultima = rs[rs.length - 1] || null;
    return {
      rodadas: rs, recentes, rotas, matriz,
      ultima: ultima ? { id: ultima.id, resumo: ultima.resumo || null,
                         itens: ultima.fila.map((it) => Object.assign({}, it, { linha: linhaDe(it) })) } : null,
      kpis: { rodadas: rs.length, buscas: todas.length, comparaveis: comparaveis.length,
              cvcMaisBarata: comparaveis.filter((l) => l.variacao_pct < 0).length,
              mediaVariacao: media, bloqueios: rs.filter((r) => r.fila.some((it) => it.status === "bloqueio")).length },
      linhas: todas,
    };
  }

  return { PADRAO, config, rotaValida, datas, urlKayak, fila, proximo, rotuloHorario, bloqueio, casa, resumo, consolida, isoLocal };
})();

if (typeof module !== "undefined") module.exports = ROTINA;   // para os testes
