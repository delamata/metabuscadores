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

// O cartao principal: menor preco da CVC x menor preco da Decolar, lado a
// lado, e a diferenca entre os dois.
function veredito(d, rival) {
  if (d == null) return "";
  if (Math.abs(d) < 0.05) return `<div class="veredito empate">CVC e ${esc(rival)} empatam</div>`;
  const quanto = dif(Math.abs(d)).replace("+", "");
  return d < 0
    ? `<div class="veredito bom">CVC ${quanto} mais barata que a ${esc(rival)}</div>`
    : `<div class="veredito ruim">CVC ${quanto} mais cara que a ${esc(rival)}</div>`;
}

function destaque(e) {
  const rival = e.rival || "Decolar";
  const lado = (classe, nome, valor, nota) => `<div class="lado ${classe}">
      <div class="rotulo">${esc(nome)}</div>
      <div class="preco">${valor == null ? "—" : brl(valor)}</div>
      <div class="nota">${nota}</div></div>`;
  const f = e.frente_a_frente || { cvc: 0, rival: 0, empate: 0 };
  const disputados = f.cvc + f.rival + f.empate;
  const frente = disputados
    ? `<div class="frente">Nos ${disputados} voo(s) que as duas vendem:
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
  ${cobertura(e, rival)}`;
}

// Cobertura: em quantos dos voos da busca cada uma tem oferta.
function barraDupla(cvcN, rivN, total, rival) {
  const larg = (n) => (total ? (n / total * 100).toFixed(1) : 0);
  return `<div class="duas">
    <div class="linha-barra"><span class="marca cvc">CVC</span>
      <span class="barra"><i class="cvc" style="width:${larg(cvcN)}%"></i></span>
      <b>${total ? pct(cvcN / total) : "—"}</b></div>
    <div class="linha-barra"><span class="marca rival">${esc(rival)}</span>
      <span class="barra"><i class="rival" style="width:${larg(rivN)}%"></i></span>
      <b>${total ? pct(rivN / total) : "—"}</b></div>
  </div>`;
}
function cobertura(e, rival) {
  const total = e.total_itinerarios || 0;
  const cvcN = e.itinerarios_do_agente || 0, rivN = e.itinerarios_do_rival || 0;
  let leitura = "";
  if (total && (cvcN || rivN)) {
    if (cvcN === rivN) leitura = "mesma cobertura";
    else {
      const maior = cvcN > rivN ? "CVC" : rival;
      const vezes = Math.min(cvcN, rivN) ? (Math.max(cvcN, rivN) / Math.min(cvcN, rivN)) : null;
      leitura = `${esc(maior)} tem ${Math.abs(cvcN - rivN)} voo(s) a mais`
        + (vezes ? ` (${vezes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×)` : "");
    }
  }
  return `<div class="cartao">
    <div class="cobertura-topo"><span class="rotulo">Cobertura</span>
      <span class="suave">de ${total} voos na busca</span></div>
    ${barraDupla(cvcN, rivN, total, rival)}
    <div class="numeros-cob">
      <span><b>${cvcN}</b> voos CVC</span>
      <span><b>${rivN}</b> voos ${esc(rival)}</span>
    </div>
    ${leitura ? `<div class="frente">${leitura}</div>` : ""}
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
  return `<div class="cia">
    <div class="cia-topo"><span class="cia-nome">${esc(l.cia)}</span>${seloTempo(l)}</div>
    <div class="cia-grade">
      <div><div class="rotulo">CVC</div><div class="valor">${brl(l.menor_agente)}${difer}</div></div>
      <div><div class="rotulo">${esc(rival)}</div><div class="valor">${brl(l.menor_rival)}</div></div>
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
      ? '<br><button id="permissao">Conceder acesso ao proxy ES</button>' : "";
    return `<div class="aviso erro">Log do ConectaAS indisponível: ${esc(l.erro)}${botao}</div>`;
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

function pronto(e) {
  const avisos = [];
  if (!e.busca_completou)
    avisos.push("A busca não chegou a completar — os números podem estar incompletos.");
  if (!e.rival_participa_da_busca)
    avisos.push(`A ${e.rival || "Decolar"} não aparece entre as agências desta busca.`);
  if (!e.agente_participa_da_busca)
    avisos.push(`O agente ${e.agente} não aparece entre os agentes desta busca.`);
  return topo(e)
    + cabecalhoRota(e.cfg, status("ok", `Análise pronta às ${esc(e.quando)} · ${esc(e.polls)} leitura(s)`))
    + avisos.map((a) => `<div class="aviso">${esc(a)}</div>`).join("")
    + destaque(e)
    + kpis(e)
    + `<h2>Por companhia</h2><div class="cartao">${
        (e.por_cia || []).map((l) => cia(l, e.rival || "Decolar")).join("") || '<span class="fraco">Nenhum itinerário.</span>'}</div>`
    + posicoes(e.posicoes)
    + combinadas(e.combinadas)
    + `<h2>Detalhes</h2>` + log(e);
}

function diagnostico(d) {
  if (!d) return "";
  const bloco = (titulo, v) => `<div class="rotulo">${titulo}</div><pre>${esc(JSON.stringify(v, null, 1))}</pre>`;
  return `<details data-k="diag"><summary>Diagnóstico</summary>
    <div class="suave">${d.total_capturas} corpo(s) capturado(s) · ${d.total_vistos} requisição(ões) vista(s)
      · ${d.amostras || 0} resposta(s) guardada(s)</div>
    ${botaoBaixar()}
    ${bloco("Corpos capturados", d.capturas)}${bloco("Requisições vistas", d.vistos)}
    ${bloco("Workers / service worker do site", { workers: d.workers, sw: d.sw })}
    ${bloco("Falhas de leitura", d.falhas)}</details>`;
}

// ---- desenho --------------------------------------------------------------- #
function desenha(e) {
  if (!e) return;
  const corpo = e.estado === "pronto" ? pronto(e)
    : e.estado === "coletando" ? coletando(e) : vigiando(e);
  // a batida redesenha a cada 3s; sem isto os <details> fechariam sozinhos
  const abertos = new Set([...app.querySelectorAll("details[open]")].map((d) => d.dataset.k));
  app.innerHTML = corpo + diagnostico(e.diagnostico);
  for (const d of app.querySelectorAll("details")) if (abertos.has(d.dataset.k)) d.open = true;
  for (const bb of app.querySelectorAll("button.baixar")) bb.onclick = () => baixar(bb);
  const b = document.getElementById("permissao");
  if (b) b.onclick = () => chrome.permissions.request(
    { origins: ["https://api-java-soap-partnership.k8s-cvc.com.br/*"] });
}

chrome.storage.local.get("estado").then(({ estado }) => desenha(estado));
chrome.storage.onChanged.addListener((mud, area) => {
  if (area === "local" && mud.estado) desenha(mud.estado.newValue);
});
