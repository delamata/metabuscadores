// Painel do Afiliados: so desenha a leitura que o coletor publica em
// "af_estado" e o historico "afh:...". So a CVC aparece com o nome real.
const app = document.getElementById("app");

const esc = (v) => String(v ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v % 1 ? 2 : 0 }));
const dif = (d) => `${d > 0 ? "+" : ""}${d.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const marca = (a) => `<span class="marca ${esc(a.cor || "")}">${esc(a.rotulo)}</span>`;
const TIPO = { passagem: "Passagem", pacote: "Pacote", hotel: "Hotel", cruzeiro: "Cruzeiro", carro: "Carro", outro: "Outro" };

function topo() {
  return `<div class="topo"><img src="icones/icone32.png" alt=""><b>Afiliados CVC</b><span class="chip">Melhores Destinos</span></div>`;
}

function kpis(e) {
  const r = e.resumo;
  return `<div class="kpis">
    <div class="kpi"><b>${r.total}</b><span>ofertas na página</span></div>
    <div class="kpi cvc"><b>${r.cvc_ofertas}</b><span>com a CVC</span></div>
    <div class="kpi"><b>${r.concorrentes_ofertas}</b><span>de concorrentes</span></div>
  </div>`;
}

// Quantidade de ofertas por player (CVC sempre na lista, mesmo com 0)
function porPlayer(e) {
  const r = e.resumo;
  const lista = r.por_agencia.slice();
  if (!lista.some((a) => a.id === "cvc")) lista.push({ id: "cvc", rotulo: "CVC", cor: "cvc", ofertas: 0, menor: null });
  const max = Math.max(1, ...lista.map((a) => a.ofertas));
  const linhas = lista.map((a) => `<div class="linha-barra">${marca(a)}
    <span class="barra"><i class="${esc(a.cor || "")}" style="width:${(a.ofertas / max * 100).toFixed(1)}%"></i></span>
    <b>${a.ofertas}</b></div>`).join("");
  const sem = r.semAgencia ? `<div class="fraco" style="margin-top:6px;font-size:11px">${r.semAgencia} oferta(s) sem agência identificada${
    e.tipo === "lista" ? " (o título do card não cita agência — o vendedor aparece dentro do post)" : ""}.</div>` : "";
  return `<h2>Ofertas por player</h2><div class="cartao">${linhas}${sem}</div>`;
}

// Comparativo: menor preco da CVC x menor preco de cada player
function comparativo(e) {
  const r = e.resumo;
  if (!r.comparativo.length) return "";
  if (r.cvc_menor == null) {
    return `<h2>Comparativo de preço</h2><div class="cartao"><div class="aviso" style="margin-top:0">A CVC não tem oferta com preço nesta página.</div>
      ${r.comparativo.map((c) => `<div class="comp">${marca(c)}<span class="suave">menor preço</span><span class="valor">${brl(c.menor)}</span></div>`).join("")}</div>`;
  }
  const linhas = r.comparativo.map((c) => `<div class="comp">${marca(c)}
    <span class="valor">${brl(c.menor)}</span>
    <span>${c.dif == null ? '<span class="fraco">—</span>' : `<span class="tag ${c.dif <= 0 ? "bom" : "ruim"}">${dif(c.dif)}</span>`}</span></div>`).join("");
  return `<h2>Comparativo de preço</h2><div class="cartao">
    <div class="comp"><span class="marca cvc">CVC</span><span class="suave">menor preço CVC</span><span class="valor">${brl(r.cvc_menor)}</span></div>
    ${linhas}
    <div class="fraco" style="margin-top:6px;font-size:11px">% = CVC acima (+) ou abaixo (−) do menor preço do player: (CVC − player) ÷ player.</div></div>`;
}

function ofertas(e) {
  if (!e.ofertas.length) return `<div class="cartao vazio">Nenhuma oferta encontrada nesta página.</div>`;
  const itens = e.ofertas.slice(0, 40).map((o) => `<div class="oferta">
    <div class="t">${esc(e.tipo === "post" ? (o.texto || o.titulo) : o.titulo)}</div>
    <div class="rodape">${o.agencias.map(marca).join("") || '<span class="fraco">sem agência</span>'}
      <span>${esc(TIPO[o.tipo] || o.tipo)}</span>${o.quando ? `<span>· ${esc(o.quando)}</span>` : ""}
      <span class="p">${brl(o.preco)}</span></div></div>`).join("");
  const mais = e.ofertas.length > 40 ? `<div class="fraco" style="margin-top:6px">+${e.ofertas.length - 40} — todas vão no Excel</div>` : "";
  return `<h2>Ofertas</h2><div class="cartao">${itens}${mais}</div>`;
}

// ---- historico --------------------------------------------------------------- #
// Uma linha por oferta lida, para o Excel (CSV pt-BR: ";" e virgula decimal).
let historico = [];
async function carregaHistorico() {
  const tudo = await chrome.storage.local.get(null);
  historico = Object.entries(tudo).filter(([k]) => k.startsWith("afh:")).map(([k, v]) => Object.assign({ chave: k }, v))
    .sort((a, b) => (a.quando < b.quando ? -1 : 1));
}
const num = (v) => (v == null ? "" : v.toFixed(2).replace(".", ","));
const cel = (v) => { const s = v == null ? "" : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function csv(paginas) {
  const cab = ["Data da leitura", "Hora", "Página", "Tipo de página", "Título da página", "Oferta", "Tipo", "Player", "Preço", "Publicada"];
  const linhas = [];
  for (const p of paginas) {
    const d = new Date(p.quando);
    const data = d.toLocaleDateString("pt-BR"), hora = d.toLocaleTimeString("pt-BR");
    for (const o of p.ofertas) {
      const quem = o.agencias.length ? o.agencias.map((a) => a.rotulo).join(", ") : "sem agência";
      linhas.push([data, hora, p.url, p.tipo === "post" ? "post" : "lista", p.titulo, o.texto || o.titulo,
                   TIPO[o.tipo] || o.tipo, quem, num(o.preco), o.quando || ""].map(cel).join(";"));
    }
  }
  return "﻿" + [cab.join(";"), ...linhas].join("\r\n") + "\r\n";
}
function exporta() {
  const blob = new Blob([csv(historico)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `afiliados-historico-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
let limparArmado = 0;
async function limpa(b) {
  if (Date.now() - limparArmado > 4000) { limparArmado = Date.now(); b.textContent = "Clique de novo para apagar"; return; }
  await chrome.storage.local.remove(historico.map((h) => h.chave));
}
function cartaoHistorico() {
  const n = historico.length, of = historico.reduce((s, h) => s + h.ofertas.length, 0);
  return `<h2>Histórico</h2><div class="cartao">
    <div><b>${n}</b> página(s) lida(s) · ${of} oferta(s) <span class="fraco">— uma linha por página por dia</span></div>
    <div class="botoes"><button id="h-exp" ${n ? "" : "disabled"}>Exportar para Excel</button>
      <button id="h-limpa" ${n ? "" : "disabled"}>Limpar histórico</button></div></div>`;
}

function diagnostico(e) {
  const desc = (e.desconhecidos || []).slice(0, 10).map((d) => `<div><code>${esc(d.host)}</code> · ${d.n}</div>`).join("");
  return `<details data-k="diag"><summary>Diagnóstico</summary>
    <div class="suave">Tipo de página: <b>${esc(e.tipo)}</b> · lida às ${esc(new Date(e.quando).toLocaleTimeString("pt-BR"))}</div>
    ${desc ? `<div class="suave" style="margin-top:6px">Links externos não reconhecidos (não entram na conta):</div>${desc}` : ""}
    <div class="botoes"><button id="d-baixar">Baixar página (HTML)</button></div>
    <div class="fraco" style="font-size:11px;margin-top:4px">Para calibrar o leitor com a página real, se algo não for reconhecido.</div></details>`;
}

function desenha(e) {
  if (!e) return;
  const aberto = !!(app.querySelector("details[open]"));
  const cab = `<div class="pagina">${esc(e.titulo)}</div>
    <div class="meta">${e.tipo === "post" ? "Post de promoção" : "Lista de promoções"} · ${esc(new URL(e.url).pathname)}</div>`;
  const aviso = e.tipo === "post" && e.preco_resumo != null
    ? `<div class="aviso">Resumo do post: a partir de <b>${brl(e.preco_resumo)}</b></div>` : "";
  app.innerHTML = topo() + cab + aviso + kpis(e) + porPlayer(e) + comparativo(e) + ofertas(e) + cartaoHistorico() + diagnostico(e);
  if (aberto && app.querySelector("details")) app.querySelector("details").open = true;
  const b = (id) => document.getElementById(id);
  if (b("h-exp")) b("h-exp").onclick = exporta;
  if (b("h-limpa")) b("h-limpa").onclick = () => limpa(b("h-limpa"));
  b("d-baixar").onclick = async () => {
    try {
      const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(aba.id, { tipo: "af-baixar" });
    } catch (err) { b("d-baixar").textContent = "A aba não respondeu — recarregue a página"; }
  };
}

let ultimo = null;
carregaHistorico().then(() => chrome.storage.local.get("af_estado")).then(({ af_estado }) => { ultimo = af_estado; desenha(af_estado); });
chrome.storage.onChanged.addListener(async (mud, area) => {
  if (area !== "local") return;
  if (Object.keys(mud).some((k) => k.startsWith("afh:"))) await carregaHistorico();
  if (mud.af_estado) ultimo = mud.af_estado.newValue;
  desenha(ultimo);
});
