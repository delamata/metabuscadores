// Painel lateral: so desenha. Le o estado que o coletor escreve em
// chrome.storage.local e redesenha a cada mudanca. Nenhuma conta mora aqui.
const app = document.getElementById("app");

const esc = (v) => String(v ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => (v == null ? "—"
  : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const ms = (v) => `${Number(v).toLocaleString("pt-BR")} ms`;
const pct = (v) => `${(v * 100).toFixed(0)}%`;

function cabecalho(e) {
  const site = e.site
    ? `<span class="site ${esc(e.site)}">${esc(e.site_nome || e.site)}</span>` : "";
  return `<h1>Analise CVC ${site}</h1>`;
}

function rota(c) {
  if (!c) return '<span class="fraco">rota nao reconhecida na URL</span>';
  const volta = c.volta ? ` · volta ${esc(c.volta)}` : " · so ida";
  return `<b>${esc(c.origem)} → ${esc(c.destino)}</b> · ida ${esc(c.ida)}${volta}`
    + ` · ${esc(c.adultos)} adulto(s)`;
}

function vigiando(e) {
  return `${cabecalho(e)}
    <div class="caixa">Site reconhecido. Vigiando a aba — faca a busca normalmente.<br>
    ${rota(e.rota)}</div>`;
}

function coletando(e) {
  const fase = e.completou
    ? `busca completa; ouvindo ofertas atrasadas (${esc(e.carencia)}s)`
    : `esperando status=complete (ate ${esc(e.resta)}s)`;
  return `${cabecalho(e)}
    <div class="caixa">Coletando: <b>${esc(e.polls)}</b> poll(s) · ultimo status
    <code>${esc(e.status_poll)}</code><br>${esc(fase)}<br>${rota(e.cfg)}</div>`;
}

function seloTempo(l) {
  const s = [];
  if (l.timeout_ms != null)
    s.push(`<span class="selo timeout">${esc(l.fonte_timeout)} timeout ${ms(l.timeout_ms)}</span>`);
  else if (l.fonte_timeout)
    s.push(`<span class="selo timeout">${esc(l.fonte_timeout)} falhou</span>`);
  if (l.tempo_ms != null) s.push(`<span class="selo">${esc(l.fonte)} ${ms(l.tempo_ms)}</span>`);
  return s.join(" ") || '<span class="fraco">—</span>';
}

function tabelaCias(linhas) {
  if (!linhas.length) return '<p class="fraco">Nenhum itinerario.</p>';
  const corpo = linhas.map((l) => {
    const delta = l.delta == null ? "—"
      : `<span class="${l.delta > 0 ? "neg" : "pos"}">${l.delta > 0 ? "+" : ""}${l.delta.toFixed(1)}%</span>`;
    return `<tr><td>${esc(l.cia)}<br>${seloTempo(l)}</td>
      <td>${l.voos_agente}/${l.voos_busca}<br><span class="fraco">${pct(l.cobertura)}</span></td>
      <td>${brl(l.menor_agente)}</td><td>${brl(l.menor_busca)}</td><td>${delta}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Companhia</th><th>Voos CVC</th><th>Menor CVC</th>
    <th>Menor busca</th><th>Δ</th></tr></thead><tbody>${corpo}</tbody></table>`;
}

function posicoes(p) {
  if (!p || !p.total) return '<p class="fraco">Sem resultados ordenados.</p>';
  const faixas = Object.entries(p.no_topo || {})
    .map(([n, q]) => `top ${n}: <b>${q}</b>`).join(" · ");
  const lista = p.posicoes.length ? p.posicoes.slice(0, 40).join(", ")
    + (p.posicoes.length > 40 ? "…" : "") : "nenhuma";
  return `<div class="caixa">Primeira posicao: <b>${p.primeira ?? "—"}</b> de ${p.total}<br>
    ${faixas}<br><span class="fraco">posicoes: ${esc(lista)}</span></div>`;
}

function dicionario(o, fmt) {
  const ks = Object.entries(o || {});
  if (!ks.length) return '<span class="fraco">nenhuma</span>';
  return ks.map(([k, v]) => `${esc(k)} ${fmt(v)}`).join(" · ");
}

function blocoLog(e) {
  const l = e.log || {};
  if (l.erro) {
    const botao = l.precisaPermissao
      ? '<br><button id="permissao">Conceder acesso ao proxy ES</button>' : "";
    return `<div class="caixa erro">Log do ConectaAS indisponivel: ${esc(l.erro)}${botao}</div>`;
  }
  if (!l.correlation_ids || !l.correlation_ids.length)
    return `<div class="caixa aviso">Nenhum metaSearch no log para
      <code>${esc(l.routes)}</code> desde ${esc(l.desde)}.</div>`;
  const amb = l.ambiguo
    ? `<div class="caixa aviso">${l.correlation_ids.length} buscas na janela — usando a mais
       recente. Confira no Kibana qual e a sua.</div>` : "";
  const ids = l.correlation_ids.map((c) => {
    const h = (l.horarios || {})[c] || [];
    const usado = c === l.usado ? " <b>(usado)</b>" : "";
    return `<li><code>${esc(c.slice(0, 8))}</code>${usado} · ${esc((l.fontes_por_cid || {})[c])} fontes
      · ${esc(h[0] || "")} · <a href="${esc(CVC.urlKibana(c))}" target="_blank">abrir no Kibana</a></li>`;
  }).join("");
  return `${amb}<p class="fraco">routes <code>${esc(l.routes)}</code> · ${esc(l.docs)} docs</p>
    <ul>${ids}</ul>
    <p>Outras fontes: ${dicionario(e.outras_fontes, ms)}</p>
    <p>Outras fontes em timeout: ${dicionario(e.fontes_timeout, ms)}</p>`;
}

function pronto(e) {
  const avisos = [];
  if (!e.busca_completou)
    avisos.push("Nenhum poll trouxe status=complete — a busca pode estar incompleta.");
  if (!e.agente_participa_da_busca)
    avisos.push(`O agente ${e.agente} nao aparece na lista de agentes desta busca.`);
  const combos = Object.keys(e.combinadas || {}).length
    ? `<h2>Combinadas (CVC)</h2><p>${dicionario(e.combinadas, (v) => `<b>${v}</b>`)}</p>` : "";
  return `${cabecalho(e)}
    <p class="fraco">${rota(e.cfg)}<br>fechada as ${esc(e.quando)} · ${esc(e.polls)} poll(s)</p>
    ${avisos.map((a) => `<div class="caixa aviso">${esc(a)}</div>`).join("")}
    <div class="numeros">
      <div><b>${e.itinerarios_do_agente}</b>itinerarios ${esc(e.agente_nome)}</div>
      <div><b>${e.total_itinerarios}</b>itinerarios na busca</div>
      <div><b>${e.total_itinerarios ? pct(e.itinerarios_do_agente / e.total_itinerarios) : "—"}</b>cobertura</div>
    </div>
    <h2>Por companhia</h2>${tabelaCias(e.por_cia || [])}
    <h2>Posicoes (Recomendados)</h2>${posicoes(e.posicoes)}
    ${combos}
    <h2>Log do ConectaAS</h2>${blocoLog(e)}`;
}

function diagnostico(d) {
  if (!d) return "";
  return `<details><summary>Diagnostico</summary>
    <p>corpos capturados: ${d.total_capturas} · requisicoes de busca vistas: ${d.total_vistos}</p>
    <h2>Corpos capturados</h2><pre>${esc(JSON.stringify(d.capturas, null, 1))}</pre>
    <h2>Requisicoes vistas</h2><pre>${esc(JSON.stringify(d.vistos, null, 1))}</pre>
    <h2>Web Workers / service worker do site</h2>
    <pre>${esc(JSON.stringify({ workers: d.workers, sw: d.sw }, null, 1))}</pre>
    <h2>Falhas de leitura</h2><pre>${esc(JSON.stringify(d.falhas, null, 1))}</pre>
  </details>`;
}

function desenha(e) {
  if (!e) return;
  const corpo = e.estado === "pronto" ? pronto(e)
    : e.estado === "coletando" ? coletando(e) : vigiando(e);
  // a batida redesenha a cada 3s; sem isto o <details> fecharia sozinho
  const aberto = !!(app.querySelector("details") || {}).open;
  app.innerHTML = corpo + diagnostico(e.diagnostico);
  if (aberto && app.querySelector("details")) app.querySelector("details").open = true;
  const b = document.getElementById("permissao");
  if (b) b.onclick = () => chrome.permissions.request(
    { origins: ["https://api-java-soap-partnership.k8s-cvc.com.br/*"] });
}

chrome.storage.local.get("estado").then(({ estado }) => desenha(estado));
chrome.storage.onChanged.addListener((mud, area) => {
  if (area === "local" && mud.estado) desenha(mud.estado.newValue);
});
