// Painel lateral: so desenha. Le o estado que o coletor escreve em
// chrome.storage.local e redesenha a cada mudanca. Nenhuma conta mora aqui.
const app = document.getElementById("app");

const esc = (v) => String(v ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => (v == null ? "—"
  : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const ms = (v) => `${Number(v).toLocaleString("pt-BR")} ms`;
const pct = (v) => `${(v * 100).toFixed(0)}%`;
// diferenca em %, com sinal e virgula: "+6,7%" / "-2,7%"
const dif = (d) => `${d > 0 ? "+" : ""}${d.toLocaleString("pt-BR",
  { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const dia = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}` : esc(iso);
};

// ---- blocos ---------------------------------------------------------------- #
function topo(e) {
  const chip = e.site
    ? `<span class="chip ${esc(e.site)}">${esc(e.site_nome || e.site)}</span>` : "";
  return `<div class="topo"><img src="icones/icone32.png" alt=""><b>Metabuscadores CVC</b>${chip}</div>`;
}

function cabecalhoRota(c, status) {
  if (!c) return `<div class="rota fraco">Rota não reconhecida</div>${status}`;
  const datas = c.volta ? `${dia(c.ida)} → ${dia(c.volta)}` : `${dia(c.ida)} · só ida`;
  const adultos = `${c.adultos} adulto${c.adultos > 1 ? "s" : ""}`;
  return `<div class="rota">${esc(c.origem)} → ${esc(c.destino)}</div>
    <div class="meta">${datas} · ${adultos}</div>${status}`;
}

const status = (classe, texto) =>
  `<div class="status"><span class="ponto ${classe}"></span>${texto}</div>`;

function vigiando(e) {
  const d = e.diagnostico || {};
  // viu trafego de busca mas nao reconheceu nenhuma resposta: diz isso com
  // todas as letras e oferece o arquivo para ajustar o leitor
  const semLeitura = d.total_vistos > 0 && !d.total_capturas
    ? `<div class="aviso">Nenhuma resposta de busca foi reconhecida ainda
       (${d.total_vistos} requisição(ões) vista(s)). Atualize a página de resultados
       (F5) com o painel aberto. Se continuar assim, baixe as respostas e envie
       para ajuste do leitor.<br>${botaoBaixar()}</div>` : "";
  return topo(e) + cabecalhoRota(e.rota,
    status("", e.rota ? "Pronto para ler — faça ou atualize a busca"
                      : "Site reconhecido — faça uma busca de voos")) + semLeitura;
}

const botaoBaixar = () => '<button class="baixar">Baixar respostas capturadas</button>';

async function baixar(botao) {
  const texto = botao.textContent;
  try {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    const r = await chrome.tabs.sendMessage(aba.id, { tipo: "baixar" }, { frameId: 0 });
    botao.textContent = r && r.n ? `Baixado (${r.n} resposta(s))` : "Nada capturado ainda";
  } catch (e) {
    botao.textContent = "A aba não respondeu — recarregue a página";
  }
  setTimeout(() => { botao.textContent = texto; }, 4000);
}

function coletando(e) {
  const fase = e.completou
    ? `Busca completa · ouvindo ofertas atrasadas (${esc(e.carencia)}s)`
    : `Lendo resultados · ${esc(e.polls)} leitura(s) · até ${esc(e.resta)}s`;
  return topo(e) + cabecalhoRota(e.cfg, status("vivo", fase));
}

// O cartao principal: menor preco da CVC x menor preco do Player 1 (Decolar), lado a
// lado, e a diferenca entre os dois.
function veredito(d, rival) {
  if (d == null) return "";
  if (Math.abs(d) < 0.05) return `<div class="veredito empate">CVC e ${esc(rival)} empatam</div>`;
  const quanto = dif(Math.abs(d)).replace("+", "");
  return d < 0
    ? `<div class="veredito bom">CVC ${quanto} mais barata que o ${esc(rival)}</div>`
    : `<div class="veredito ruim">CVC ${quanto} mais cara que o ${esc(rival)}</div>`;
}

function destaque(e) {
  const rival = e.rival || "Player 1";
  const lado = (classe, nome, valor, nota) => `<div class="lado ${classe}">
      <div class="rotulo">${esc(nome)}</div>
      <div class="preco">${valor == null ? "—" : brl(valor)}</div>
      <div class="nota">${nota}</div></div>`;
  const f = e.frente_a_frente || { cvc: 0, rival: 0, empate: 0 };
  const disputados = f.cvc + f.rival + f.empate;
  const frente = disputados
    ? `<div class="frente">Nos ${disputados} voo(s) que os dois vendem:
       CVC mais barata em <b>${f.cvc}</b> · ${esc(rival)} em <b>${f.rival}</b>
       ${f.empate ? `· empate em <b>${f.empate}</b>` : ""}</div>` : "";
  const total = e.total_itinerarios || 0;
  const nota = (n, presente) => (!presente ? "não está nesta busca"
    : `${n} voo${n === 1 ? "" : "s"} · ${total ? pct(n / total) : "—"}`);
  return `<div class="cartao destaque">
    <div class="duelo">
      ${lado("cvc", "CVC", e.menor_agente, nota(e.itinerarios_do_agente, e.menor_agente != null))}
      <div class="vs">vs</div>
      ${lado("rival", rival, e.menor_rival, nota(e.itinerarios_do_rival, e.rival_participa_da_busca))}
    </div>
    ${veredito(e.delta_rival, rival)}
    ${frente}
  </div>
  ${extremos(e)}
  ${melhoresPrecos(e)}
  ${cobertura(e, rival)}`;
}

// Cobertura: em quantos dos voos da busca cada uma tem oferta.
function barraDupla(cvcN, rivN, total, rival) {
  const larg = (n) => (total ? (n / total * 100).toFixed(1) : 0);
  return `<div class="duas">
    <div class="linha-barra larga"><span class="marca cvc">CVC</span>
      <span class="barra"><i class="cvc" style="width:${larg(cvcN)}%"></i></span>
      <b>${total ? pct(cvcN / total) : "—"}</b></div>
    <div class="linha-barra larga"><span class="marca rival">${esc(rival)}</span>
      <span class="barra"><i class="rival" style="width:${larg(rivN)}%"></i></span>
      <b>${total ? pct(rivN / total) : "—"}</b></div>
  </div>`;
}
// Nome de exibicao ("Player N") + cor de cada agencia ja vem do coletor (CVC.AGENCIAS).
const marca = (ag) => `<span class="marca ${esc(ag.cor || "outra")}">${esc(ag.rotulo || ag.nome)}</span>`;

// Menor e maior preco da busca inteira, de qualquer agencia. O quadro ganha
// a cor da marca da agencia (Zupper = azul Tiffany, MaxMilhas, GOL...).
function extremos(e) {
  const mn = e.menor_geral, mx = e.maior_geral;
  if (!mn || mn.valor == null) return "";
  const quem = (ags) => (ags || []).map((a) => esc(a.rotulo || a.nome)).join(", ") || "—";
  // empate entre agencias de cores diferentes: quadro neutro
  const cor = (ags) => {
    const cs = [...new Set((ags || []).map((a) => a.cor || ""))];
    return cs.length === 1 && cs[0] ? cs[0] : "";
  };
  const quadro = (titulo, x) => `<div class="extremo ${esc(cor(x && x.agencias))}">
        <div class="rotulo">${titulo}</div>
        <div class="preco">${brl(x && x.valor)}</div>
        <div class="quem">${quem(x && x.agencias)}</div></div>`;
  return `<div class="cartao">
    <div class="cobertura-topo"><span class="rotulo">Preços da busca</span>
      <span class="suave">todas as agências</span></div>
    <div class="extremos">${quadro("Concorrente + Barato", mn)}${quadro("Concorrente + Caro", mx)}</div></div>`;
}

// Top 10 Players de um ranking + a CVC sempre, como referencia (fora da
// contagem). `ordem` ja vem ordenada; a posicao exibida e a da lista inteira.
const TOP_PLAYERS = 10;
function top10ComCvc(ordem) {
  let players = 0;
  const linhas = [];
  ordem.forEach((a, i) => {
    const ehCvc = a.cor === "cvc";
    if (ehCvc || players < TOP_PLAYERS) linhas.push({ a, pos: i + 1 });
    if (!ehCvc) players += 1;
  });
  return { linhas, fora: Math.max(0, players - TOP_PLAYERS) };
}
const foraDoTop = (n) => (n ? `<div class="frente">+${n} player(s) fora do top 10 — todos vão no Excel</div>` : "");

// Melhor preco de cada concorrente (o menor que ele ofereceu na busca), do
// mais barato para o mais caro: top 10 Players + a CVC. Cada concorrente
// mostra a diferenca da CVC sobre o melhor preco dele.
function melhoresPrecos(e) {
  const ordem = (e.por_agente || []).filter((a) => a.menor != null).slice().sort((x, y) => x.menor - y.menor);
  if (!ordem.length) return "";
  const cvc = e.menor_agente;
  const { linhas, fora } = top10ComCvc(ordem);
  const html = linhas.map(({ a, pos }) => {
    let difer = "";
    if (a.cor !== "cvc" && cvc != null) {
      const d = (cvc - a.menor) / a.menor * 100;   // mesma conta do painel: (CVC - concorrente) / concorrente
      difer = `<span class="tag ${d <= 0 ? "bom" : "ruim"}" title="CVC em relação a este concorrente">${dif(d)}</span>`;
    }
    return `<div class="linha-preco ${a.cor === "cvc" ? "eh-cvc" : ""}">
      <span class="pos-preco">${pos}º</span>${marca(a)}
      <b class="valor-preco">${brl(a.menor)}</b><span class="dif-preco">${difer}</span></div>`;
  }).join("");
  return `<div class="cartao">
    <div class="cobertura-topo"><span class="rotulo">Melhor preço por concorrente</span>
      <span class="suave">top 10 players</span></div>
    ${html}
    <div class="legenda-cob suave">% = CVC acima (+) ou abaixo (−) do melhor preço do concorrente</div>
    ${foraDoTop(fora)}
  </div>`;
}

// Cobertura por agencia: % dos voos da busca com oferta — top 10 Players + CVC.
function cobertura(e, rival) {
  const total = e.total_itinerarios || 0;
  const { linhas, fora } = top10ComCvc(e.por_agente || []);   // por_agente ja vem por voos
  const html = linhas.map(({ a }) => {
    const larg = total ? (a.voos / total * 100).toFixed(1) : 0;
    return `<div class="linha-barra larga">${marca(a)}
      <span class="barra"><i class="${esc(a.cor || "outra")}" style="width:${larg}%"></i></span>
      <span class="num-cob"><b>${total ? pct(a.voos / total) : "—"}</b> <span class="fraco">${a.voos}</span></span></div>`;
  }).join("");
  return `<div class="cartao">
    <div class="cobertura-topo"><span class="rotulo">Cobertura por concorrente</span>
      <span class="suave">top 10 · ${total} voos</span></div>
    <div class="duas">${html || '<span class="fraco">sem agências</span>'}</div>
    <div class="legenda-cob suave">% dos voos da busca com oferta · nº de voos</div>
    ${foraDoTop(fora)}
  </div>`;
}

function kpis(e) {
  const pos = e.posicoes && e.posicoes.primeira != null ? `${e.posicoes.primeira}º` : "—";
  const top10 = e.posicoes && e.posicoes.no_topo && e.posicoes.no_topo[10] != null
    ? e.posicoes.no_topo[10] : "—";
  return `<div class="kpis">
    <div class="kpi"><b>${e.total_itinerarios}</b><span>voos na busca</span></div>
    <div class="kpi"><b>${pos}</b><span>1ª posição CVC</span></div>
    <div class="kpi"><b>${top10}</b><span>CVC no top 10</span></div>
  </div>`;
}

function seloTempo(l) {
  if (l.timeout_ms != null)
    return `<span class="selo timeout">${esc(l.fonte_timeout)} timeout ${ms(l.timeout_ms)}</span>`;
  if (l.fonte_timeout) return `<span class="selo timeout">${esc(l.fonte_timeout)} falhou</span>`;
  if (l.tempo_ms != null) return `<span class="selo">${esc(l.fonte)} ${ms(l.tempo_ms)}</span>`;
  return "";
}

function cia(l, rival) {
  const difer = l.delta_rival == null ? ""
    : ` <span class="tag ${l.delta_rival <= 0 ? "bom" : "ruim"}">${dif(l.delta_rival)}</span>`;
  // CVC sem voo nesta cia: o motivo no lugar do preco
  const semCvc = l.motivo_sem_cvc
    ? `<div class="sem-cvc"><b>CVC não retornou nesta companhia</b><br>${esc(l.motivo_sem_cvc.texto)}</div>` : "";
  return `<div class="cia">
    <div class="cia-topo"><span class="cia-nome">${esc(l.cia)}</span>${seloTempo(l)}</div>
    ${semCvc}
    <div class="cia-grade">
      <div><div class="rotulo">CVC</div><div class="valor">${brl(l.menor_agente)}${difer}</div></div>
      <div><div class="rotulo rival">${esc(rival)}</div><div class="valor">${brl(l.menor_rival)}</div></div>
    </div>
    <div class="cia-cob"><span class="suave">Cobertura · ${l.voos_busca} voos</span>
      ${barraDupla(l.voos_agente, l.voos_rival || 0, l.voos_busca, rival)}
      <div class="numeros-cob"><span><b>${l.voos_agente}</b> CVC</span>
        <span><b>${l.voos_rival || 0}</b> ${esc(rival)}</span></div></div>
  </div>`;
}

function posicoes(p) {
  if (!p || !p.total) return "";
  const faixas = Object.entries(p.no_topo || {})
    .map(([n, q]) => `<div class="linha-par"><span class="suave">no top ${n}</span><b>${q}</b></div>`)
    .join("");
  const chips = p.posicoes.slice(0, 30)
    .map((n) => `<span class="${n <= 5 ? "topo5" : ""}">${n}</span>`).join("")
    + (p.posicoes.length > 30 ? `<span>+${p.posicoes.length - 30}</span>` : "");
  return `<h2>Posições em Recomendados</h2>
    <div class="cartao">${faixas || '<span class="fraco">poucos resultados</span>'}
    ${p.posicoes.length ? `<div class="posicoes">${chips}</div>`
                        : '<div class="fraco">CVC fora da lista</div>'}
    <div class="fraco" style="margin-top:6px">de ${p.total} resultados</div></div>`;
}

function combinadas(c) {
  const ks = Object.entries(c || {});
  if (!ks.length) return "";
  return `<h2>Combinações de companhias (CVC)</h2><div class="cartao">${ks.map(([k, v]) =>
    `<div class="linha-par"><span>${esc(k.replace(/\+/g, " + "))}</span><b>${v}</b></div>`).join("")}</div>`;
}

function pares(o, fmt) {
  const ks = Object.entries(o || {});
  if (!ks.length) return '<span class="fraco">nenhuma</span>';
  return ks.map(([k, v]) => `<code>${esc(k)}</code> ${fmt(v)}`).join(" · ");
}

function log(e) {
  const l = e.log || {};
  if (l.erro) {
    const botao = l.precisaPermissao
      ? `<br><button id="permissao" data-origem="${esc(l.origem_permissao || "")}">Conceder acesso ao proxy ES</button>` : "";
    const det = l.erro_detalhe ? `<div class="erro-det"><code>${esc(l.erro_detalhe)}</code></div>` : "";
    const tentada = l.url_tentada ? `<div class="erro-det">Endereço usado: <code>${esc(l.url_tentada)}</code></div>` : "";
    return `<div class="aviso erro">Log do ConectaAS indisponível: ${esc(l.erro)}${det}${tentada}${botao}</div>
      ${configEs()}`;
  }
  let corpo;
  if (!l.correlation_ids || !l.correlation_ids.length) {
    corpo = `<div class="suave">Nenhum metaSearch no log para esta rota desde ${esc(l.desde)}.</div>`;
  } else {
    const amb = l.ambiguo
      ? `<div class="aviso">${l.correlation_ids.length} buscas na janela — usando a mais recente.
         Confira no Kibana qual é a sua.</div>` : "";
    const ids = l.correlation_ids.map((c) => {
      const usado = c === l.usado ? " <b>· usado</b>" : "";
      return `<li><code>${esc(c.slice(0, 8))}</code>${usado}
        <span class="fraco">· ${esc((l.fontes_por_cid || {})[c])} fontes</span>
        · <a href="${esc(CVC.urlKibana(c))}" target="_blank">Kibana ↗</a></li>`;
    }).join("");
    corpo = `${amb}<ul>${ids}</ul>
      <div class="suave" style="margin-top:6px">Outras fontes: ${pares(e.outras_fontes, ms)}</div>
      <div class="suave">Em timeout: ${pares(e.fontes_timeout, ms)}</div>`;
  }
  return `<details data-k="log"><summary>Log do ConectaAS</summary>
    <div class="fraco"><code>${esc(l.routes)}</code> · ${esc(l.docs)} docs</div>${corpo}</details>`;
}

// Endereco do proxy ES, editavel: o padrao do codigo foi um palpite.
let esUrlAtual = "";
chrome.storage.local.get("config").then(({ config }) => { esUrlAtual = (config && config.es_url) || ""; });

function configEs() {
  return `<details data-k="cfg-es" open><summary>Endereço do proxy ES</summary>
    <div class="suave">URL completa do <code>_search</code> (o mesmo que o robo_cia_kibana.py usa).
      Depois de salvar, refaça a busca (F5).</div>
    <input id="es-url" type="url" spellcheck="false" placeholder="https://.../indice/_search">
    <button id="es-salvar">Salvar</button> <span id="es-ok" class="suave"></span></details>`;
}

function ligaConfigEs() {
  const campo = document.getElementById("es-url");
  if (!campo) return;
  if (document.activeElement !== campo && !campo.dataset.mexido) campo.value = esUrlAtual;
  campo.oninput = () => { campo.dataset.mexido = "1"; };
  document.getElementById("es-salvar").onclick = async () => {
    const ok = document.getElementById("es-ok");
    let url;
    try { url = new URL(campo.value.trim()); } catch (e) { ok.textContent = "URL inválida"; return; }
    if (url.protocol !== "https:") { ok.textContent = "use https://"; return; }
    // host fora do manifest: pede permissao (precisa do clique do usuario)
    const origem = `${url.origin}/*`;
    let tem = false;
    try { tem = await chrome.permissions.contains({ origins: [origem] }); } catch (e) { /* segue */ }
    if (!tem) {
      try { tem = await chrome.permissions.request({ origins: [origem] }); } catch (e) { tem = false; }
      if (!tem) { ok.textContent = "sem permissão para esse host"; return; }
    }
    esUrlAtual = url.href;
    await chrome.storage.local.set({ config: { es_url: esUrlAtual } });
    delete campo.dataset.mexido;
    ok.textContent = "salvo — refaça a busca";
  };
}

function pronto(e) {
  const avisos = [];
  if (!e.busca_completou)
    avisos.push("A busca não chegou a completar — os números podem estar incompletos.");
  if (!e.rival_participa_da_busca)
    avisos.push(`O ${e.rival || "Player 1"} não aparece entre as agências desta busca.`);
  if (!e.agente_participa_da_busca)
    avisos.push(`O agente ${e.agente} não aparece entre os agentes desta busca.`);
  return topo(e)
    + cabecalhoRota(e.cfg, status("ok", `Análise pronta às ${esc(e.quando)} · ${esc(e.polls)} leitura(s)`))
    + avisos.map((a) => `<div class="aviso">${esc(a)}</div>`).join("")
    + destaque(e)
    + kpis(e)
    + `<h2>Por companhia</h2><div class="cartao">${
        (e.por_cia || []).map((l) => cia(l, e.rival || "Player 1")).join("") || '<span class="fraco">Nenhum itinerário.</span>'}</div>`
    + posicoes(e.posicoes)
    + combinadas(e.combinadas)
    + `<h2>Detalhes</h2>` + log(e);
}

function diagnostico(d, comConfig) {
  if (!d) return "";
  const bloco = (titulo, v) => `<div class="rotulo">${titulo}</div><pre>${esc(JSON.stringify(v, null, 1))}</pre>`;
  return `<details data-k="diag"><summary>Diagnóstico</summary>
    <div class="suave">${d.total_capturas} corpo(s) capturado(s) · ${d.total_vistos} requisição(ões) vista(s)
      · ${d.amostras || 0} resposta(s) guardada(s)</div>
    ${botaoBaixar()}
    ${bloco("Corpos capturados", d.capturas)}${bloco("Requisições vistas", d.vistos)}
    ${bloco("Workers / service worker do site", { workers: d.workers, sw: d.sw })}
    ${bloco("Falhas de leitura", d.falhas)}
    ${comConfig ? configEs().replace(" open>", ">") : ""}</details>`;
}

// ---- historico --------------------------------------------------------------- #
// Linhas gravadas pelo coletor (historico.js). Carregadas a parte do estado e
// recarregadas quando uma chave "hist:" muda.
let historico = [];
let ultimoEstado = null;

async function carregaHistorico() {
  try { historico = HIST.deStorage(await chrome.storage.local.get(null)); }
  catch (e) { historico = []; }
}

function cartaoHistorico() {
  const n = historico.length;
  const desde = n ? new Date(historico[0].quando).toLocaleDateString("pt-BR") : null;
  const linhas = historico.slice(-5).reverse().map((l) => {
    const v = l.variacao_pct;
    const tag = v == null ? '<span class="fraco">—</span>'
      : `<span class="tag ${v <= 0 ? "bom" : "ruim"}">${dif(v)}</span>`;
    const datas = `${dia(l.ida)}${l.volta ? ` → ${dia(l.volta)}` : ""}`;
    return `<tr><td><b>${esc(l.rota || "—")}</b><br><span class="fraco">${datas}</span></td>
      <td>${brl(l.preco_cvc)}</td><td>${brl(l.preco_decolar)}</td><td>${tag}</td></tr>`;
  }).join("");
  return `<h2>Histórico de buscas</h2><div class="cartao">
    <div class="cobertura-topo"><span><b>${n}</b> busca${n === 1 ? "" : "s"} gravada${n === 1 ? "" : "s"}</span>
      <span class="suave">${desde ? `desde ${esc(desde)}` : "neste navegador"}</span></div>
    ${n ? `<table class="hist"><thead><tr><th>Rota</th><th>CVC</th><th>Player 1</th><th>%</th></tr></thead>
      <tbody>${linhas}</tbody></table>`
        : '<div class="suave">Cada busca analisada vira uma linha aqui.</div>'}
    <div class="botoes-hist">
      <button id="hist-exportar" ${n ? "" : "disabled"}>Exportar para Excel</button>
      <button id="hist-limpar" class="perigo" ${n ? "" : "disabled"}>Limpar histórico</button>
    </div></div>`;
}

function exportaHistorico() {
  const blob = new Blob([HIST.csv(historico)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `metabuscadores-historico-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Apagar pede dois cliques: o painel lateral nao e lugar para confirm().
let limparArmado = 0;
async function limpaHistorico(botao) {
  if (Date.now() - limparArmado > 4000) {
    limparArmado = Date.now();
    botao.textContent = `Clique de novo para apagar ${historico.length}`;
    setTimeout(() => { if (botao.isConnected) botao.textContent = "Limpar histórico"; }, 4000);
    return;
  }
  limparArmado = 0;
  await chrome.storage.local.remove(historico.map((l) => l.chave));
}

// ---- desenho --------------------------------------------------------------- #
function desenha(e) {
  if (!e) return;
  ultimoEstado = e;
  const corpo = e.estado === "pronto" ? pronto(e)
    : e.estado === "coletando" ? coletando(e) : vigiando(e);
  // a batida redesenha a cada 3s; sem isto os <details> fechariam sozinhos
  const abertos = new Set([...app.querySelectorAll("details[open]")].map((d) => d.dataset.k));
  // ...nem o campo do endereco perderia o que esta sendo digitado
  const campo = document.getElementById("es-url");
  const rascunho = campo && campo.dataset.mexido ? campo.value : null;
  const comFoco = campo && document.activeElement === campo;
  const cursor = campo ? campo.selectionStart : null;
  // o campo do endereco aparece junto do erro do log; sem erro, fica no Diagnostico
  const erroLog = e.estado === "pronto" && e.log && e.log.erro;
  app.innerHTML = corpo + cartaoHistorico() + diagnostico(e.diagnostico, !erroLog);
  const novo = document.getElementById("es-url");
  if (novo && rascunho !== null) { novo.value = rascunho; novo.dataset.mexido = "1"; }
  if (novo && comFoco) { novo.focus(); if (cursor !== null) novo.setSelectionRange(cursor, cursor); }
  for (const d of app.querySelectorAll("details")) if (abertos.has(d.dataset.k)) d.open = true;
  for (const bb of app.querySelectorAll("button.baixar")) bb.onclick = () => baixar(bb);
  const b = document.getElementById("permissao");
  if (b) b.onclick = () => chrome.permissions.request(
    { origins: [b.dataset.origem || "https://api-java-soap-partnership.k8s-cvc.com.br/*"] });
  ligaConfigEs();
  const ex = document.getElementById("hist-exportar");
  if (ex) ex.onclick = exportaHistorico;
  const lp = document.getElementById("hist-limpar");
  if (lp) lp.onclick = () => limpaHistorico(lp);
}

carregaHistorico().then(() => chrome.storage.local.get("estado")).then(({ estado }) => desenha(estado));
chrome.storage.onChanged.addListener(async (mud, area) => {
  if (area !== "local") return;
  if (Object.keys(mud).some((k) => k.startsWith(HIST.PREFIXO))) {
    await carregaHistorico();
    if (!mud.estado && ultimoEstado) desenha(ultimoEstado);
  }
  if (mud.estado) desenha(mud.estado.newValue);
});
