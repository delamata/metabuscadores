// Painel do Afiliados: so desenha a leitura do post de promocao que o coletor
// publica em "af_estado" e o historico "afh:...". So a CVC aparece com o nome real.
const app = document.getElementById("app");

const esc = (v) => String(v ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v % 1 ? 2 : 0 }));
const marca = (a) => `<span class="marca ${esc(a.cor || "")}">${esc(a.rotulo)}</span>`;

function topo() {
  return `<div class="topo"><img src="icones/icone32.png" alt=""><b>Afiliados CVC</b><span class="chip">Melhores Destinos</span></div>`;
}

function kpis(e) {
  const r = e.resumo, v = e.vendedores;
  return `<div class="kpis">
    <div class="kpi"><b>${r.trechos}</b><span>trechos com preço</span></div>
    <div class="kpi"><b>${brl(r.menor)}</b><span>menor preço</span></div>
    <div class="kpi ${v.cvc ? "cvc" : "sem-cvc"}"><b>${v.cvc ? "Sim" : "Não"}</b><span>CVC no buscador</span></div>
  </div>`;
}

// Vendedores do buscador do post: quem participa e quem o botao abre
function buscador(e) {
  const v = e.vendedores;
  if (!v.lista.length) {
    return `<h2>Buscador do post</h2><div class="cartao"><div class="fraco">Este post não traz a lista de vendedores do buscador.</div></div>`;
  }
  const chips = v.lista.map((a) => `<div class="vend">${marca(a)}${a.primeiro ? '<span class="tag abre">o botão abre este</span>' : ""}</div>`).join("");
  const semCvc = v.cvc ? "" : `<div class="aviso">A CVC não está entre os vendedores deste post.</div>`;
  const cvcAtras = v.cvc && v.primeiro && v.primeiro.id !== "cvc"
    ? `<div class="fraco nota">A CVC participa, mas o botão “Pesquisar” abre ${esc(v.primeiro.rotulo)} (prioridade do site).</div>` : "";
  return `<h2>Buscador do post · ${v.lista.length} vendedor(es)</h2><div class="cartao">${chips}${semCvc}${cvcAtras}</div>`;
}

// O que da para comparar: o preco do titulo com a tabela, e por destino
function precos(e) {
  const r = e.resumo;
  if (!r.trechos) {
    const pq = !e.tem_precos ? "Este post não tem tabela de preços." : e.ativa === false ? "A promoção está encerrada." : "A tabela de trechos ainda não carregou.";
    return `<h2>Preços</h2><div class="cartao vazio">${esc(pq)}</div>`;
  }
  const destinos = r.por_destino.map((d) => `<div class="comp"><span><b>${esc(d.nome)}</b> <span class="fraco">· ${d.n} trecho(s)</span></span>
    <span class="suave">até ${brl(d.maior)}</span><span class="valor">${brl(d.menor)}</span></div>`).join("");
  const titulo = e.preco_titulo != null && r.menor != null
    ? `<div class="fraco nota">Título do post: a partir de ${brl(e.preco_titulo)} · ${e.preco_titulo === r.menor ? "confere com a tabela" : `tabela hoje: ${brl(r.menor)}`}</div>` : "";
  return `<h2>Preço por destino</h2><div class="cartao">${destinos}
    <div class="comp"><span class="suave">Mediana dos ${r.com_preco} trechos</span><span></span><span class="valor">${brl(r.mediana)}</span></div>${titulo}</div>`;
}

// A pagina nao diz de qual vendedor e cada preco: o comparativo CVC x Player
// nao sai daqui. Dizemos isso em vez de inventar.
function comparativo(e) {
  if (!e.resumo.trechos) return "";
  return `<h2>Comparativo de preço</h2><div class="cartao"><div class="aviso" style="margin-top:0">
    O post mostra o <b>menor preço de cada trecho</b>, sem dizer de qual vendedor ele é. Por isso o comparativo CVC × Player
    não sai desta página — só a presença de cada um no buscador e os preços da promoção.</div></div>`;
}

function trechos(e) {
  if (!e.trechos.length) return "";
  const lista = e.trechos.slice().sort((a, b) => (a.preco ?? Infinity) - (b.preco ?? Infinity));
  const itens = lista.slice(0, 40).map((t) => `<div class="trecho"><span>${esc(t.origem)} <span class="fraco">→</span> ${esc(t.destino)}</span>
    <span class="p">${t.preco == null ? esc(t.texto) : brl(t.preco)}</span></div>`).join("");
  const mais = lista.length > 40 ? `<div class="fraco nota">+${lista.length - 40} trechos — todos vão no Excel</div>` : "";
  return `<h2>Trechos · ${e.resumo.origens} origem(ns)</h2><div class="cartao">${itens}${mais}</div>`;
}

// ---- historico --------------------------------------------------------------- #
// Uma linha por trecho lido, para o Excel (CSV pt-BR: ";" e virgula decimal).
// Leituras da versao 0.1 (outro formato, sem trechos) ficam de fora.
let historico = [];
async function carregaHistorico() {
  const tudo = await chrome.storage.local.get(null);
  historico = Object.entries(tudo).filter(([k, v]) => k.startsWith("afh:") && v && v.trechos)
    .map(([k, v]) => Object.assign({ chave: k }, v)).sort((a, b) => (a.quando < b.quando ? -1 : 1));
}
const num = (v) => (v == null ? "" : v.toFixed(2).replace(".", ","));
const cel = (v) => { const s = v == null ? "" : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function csv(posts) {
  const cab = ["Data da leitura", "Hora", "Post", "Página", "Tipo", "Origem", "Cód. origem", "Destino", "Cód. destino", "Preço",
               "CVC no buscador", "Vendedores no buscador", "Botão abre"];
  const linhas = [];
  for (const p of posts) {
    const d = new Date(p.quando);
    const data = d.toLocaleDateString("pt-BR"), hora = d.toLocaleTimeString("pt-BR");
    const v = p.vendedores;
    const comum = [v.cvc ? "Sim" : "Não", v.lista.map((a) => a.rotulo).join(", "), v.primeiro ? v.primeiro.rotulo : ""];
    for (const t of p.trechos) {
      linhas.push([data, hora, p.titulo, p.url, p.tipo === "pacote" ? "Pacote" : "Passagem", t.origem, t.origem_cod,
                   t.destino, t.destino_cod, num(t.preco), ...comum].map(cel).join(";"));
    }
  }
  return "\ufeff" + [cab.join(";"), ...linhas].join("\r\n") + "\r\n";
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
  const n = historico.length, tr = historico.reduce((s, h) => s + h.trechos.length, 0);
  return `<h2>Histórico</h2><div class="cartao">
    <div><b>${n}</b> post(s) lido(s) · ${tr} trecho(s) <span class="fraco">— uma leitura por post por dia</span></div>
    <div class="botoes"><button id="h-exp" ${n ? "" : "disabled"}>Exportar para Excel</button>
      <button id="h-limpa" ${n ? "" : "disabled"}>Limpar histórico</button></div></div>`;
}

function diagnostico(e) {
  const desc = e.vendedores.desconhecidos.length
    ? `<div class="suave" style="margin-top:6px">Vendedor fora do catálogo: ${e.vendedores.desconhecidos.map((c) => `<code>${esc(c)}</code>`).join(" ")}</div>` : "";
  return `<details data-k="diag"><summary>Diagnóstico</summary>
    <div class="suave">Dados da promoção no post: <b>${e.tem_promo ? "sim" : "não"}</b> · tabela de preços: <b>${e.tem_precos ? "sim" : "não"}</b>
      · ${e.trechos.length} linha(s) lida(s) · às ${esc(new Date(e.quando).toLocaleTimeString("pt-BR"))}</div>${desc}
    <div class="botoes"><button id="d-baixar">Baixar página (HTML)</button></div>
    <div class="fraco nota">Para calibrar o leitor com a página real, se algo não for reconhecido.</div></details>`;
}

function desenha(e) {
  if (!e || !e.vendedores) return;   // nada lido ainda (ou leitura da versao 0.1)
  const aberto = !!(app.querySelector("details[open]"));
  const quando = new Date(e.quando);
  const cab = `<div class="pagina">${esc(e.titulo)}</div>
    <div class="meta">Post de promoção · ${e.tipo === "pacote" ? "pacotes" : e.ida_e_volta === false ? "passagens só ida" : "passagens ida e volta"}
      · lido ${esc(quando.toLocaleDateString("pt-BR"))} ${esc(quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}</div>`;
  app.innerHTML = topo() + cab + kpis(e) + buscador(e) + precos(e) + comparativo(e) + trechos(e) + cartaoHistorico() + diagnostico(e);
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
