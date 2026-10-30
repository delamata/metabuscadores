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

const ord = (n) => `${n}º`;

function kpis(e) {
  const r = e.resumo, v = e.vendedores;
  const cvc = v.cvc
    ? `<div class="kpi cvc"><b>${ord(v.cvc_posicao)} de ${v.lista.length}</b><span>posição da CVC no buscador</span></div>`
    : `<div class="kpi sem-cvc"><b>Fora</b><span>CVC não está no buscador</span></div>`;
  return `<div class="kpis">
    <div class="kpi"><b>${r.trechos}</b><span>trechos com preço</span></div>
    <div class="kpi"><b>${brl(r.menor)}</b><span>menor preço do post</span></div>
    ${cvc}
  </div>`;
}

// A CVC no post: posicao na lista, vez no botao e o preco medido nos "ver datas"
function cartaoCvc(e) {
  const v = e.vendedores;
  if (!v.cvc) return "";
  const vez = v.cvc_vez_botao == null ? "—"
    : v.cvc_vez_botao === 1 ? "1º — o botão abre a CVC"
    : `${ord(v.cvc_vez_botao)} — só abre a CVC se ${v.antes_da_cvc.join(" e ")} não estiverem no post`;
  return `<h2>CVC neste post</h2><div class="cartao cvc-borda">
    <div class="comp"><span class="suave">posição na lista do buscador</span><span></span><span class="valor">${ord(v.cvc_posicao)} de ${v.lista.length}</span></div>
    <div class="comp"><span class="suave">vez no botão “Pesquisar”</span><span></span><span class="valor quebra">${esc(vez)}</span></div>
    ${trechosMedidos(e)}</div>`;
}

// Vendedores do buscador do post: quem participa (na ordem do post) e quem o botao abre
function buscador(e) {
  const v = e.vendedores;
  if (!v.lista.length) {
    return `<h2>Buscador do post</h2><div class="cartao"><div class="fraco">Este post não traz a lista de vendedores do buscador.</div></div>`;
  }
  const chips = v.lista.map((a) => `<div class="vend"><span class="pos">${a.posicao}º</span>${marca(a)}${a.primeiro ? '<span class="tag abre">o botão abre este</span>' : ""}</div>`).join("");
  const semCvc = v.cvc ? "" : `<div class="aviso">A CVC não está entre os vendedores deste post.</div>`;
  return `<h2>Buscador do post · ${v.lista.length} vendedor(es)</h2><div class="cartao">${chips}${semCvc}</div>`;
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
let historico = [], historicoVoos = [];
async function carregaHistorico() {
  const tudo = await chrome.storage.local.get(null);
  const pega = (pref, ok) => Object.entries(tudo).filter(([k, v]) => k.startsWith(pref) && v && ok(v))
    .map(([k, v]) => Object.assign({ chave: k }, v)).sort((a, b) => (a.quando < b.quando ? -1 : 1));
  historico = pega("afh:", (v) => v.trechos);
  historicoVoos = pega("afv:", (v) => v.datas);
}
const num = (v) => (v == null ? "" : v.toFixed(2).replace(".", ","));
const pct = (v) => (v == null ? "" : v.toFixed(1).replace(".", ",") + "%");
const cel = (v) => { const s = v == null ? "" : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const dataHora = (q) => { const d = new Date(q); return [d.toLocaleDateString("pt-BR"), d.toLocaleTimeString("pt-BR")]; };
const BAGAGEM = { carry_on_luggage_only: "só bagagem de mão", checked_luggage: "com bagagem despachada", bag_personal: "só item pessoal" };
const bagagem = (b) => BAGAGEM[b] || b || "";
// titulo do post: da leitura do post no historico, se houver; senao o slug
const tituloPost = (h) => { const p = historico.slice().reverse().find((x) => x.url.replace(/[?#].*$/, "") === h.post_url);
  return p ? p.titulo : CATALOGO.mascara(String(h.slug || "").replace(/-/g, " ")); };
const arquivo = (texto, nome) => {
  const blob = new Blob(["\ufeff" + texto], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
};
const tabela = (cab, linhas) => [cab.join(";"), ...linhas.map((l) => l.map(cel).join(";"))].join("\r\n") + "\r\n";

// Excel 1: uma linha por trecho do post
function csvPosts(posts) {
  const cab = ["Data da leitura", "Hora", "Post", "Página", "Tipo", "Origem", "Cód. origem", "Destino", "Cód. destino", "Preço",
               "CVC no buscador", "Posição CVC no buscador", "Vez CVC no botão", "Vendedores no buscador", "Botão abre"];
  const linhas = [];
  for (const p of posts) {
    const v = p.vendedores;
    const comum = [v.cvc ? "Sim" : "Não", v.cvc ? `${v.cvc_posicao} de ${v.lista.length}` : "", v.cvc_vez_botao || "",
                   v.lista.map((a) => a.rotulo).join(", "), v.primeiro ? v.primeiro.rotulo : ""];
    for (const t of p.trechos) {
      linhas.push([...dataHora(p.quando), p.titulo, p.url, p.tipo === "pacote" ? "Pacote" : "Passagem", t.origem, t.origem_cod,
                   t.destino, t.destino_cod, num(t.preco), ...comum]);
    }
  }
  return tabela(cab, linhas);
}
// "17/2" no mes "2027-02" -> "17/02/2027" (volta num mes antes do da ida: ano seguinte)
function dataCompleta(dm, mes, mesIda) {
  const [d, m] = String(dm || "").split("/").map(Number);
  if (!d || !m) return dm || "";
  let ano = Number(mes.slice(0, 4));
  if (mesIda && m < mesIda) ano += 1;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${ano}`;
}
// Excel 2: uma linha por data com preco e vendedor ("ver datas")
function csvVoos(lidos) {
  const cab = ["Data da leitura", "Hora", "Post", "Origem", "Destino", "Mês", "Ida", "Volta", "Estadia (dias)", "Posição na lista",
               "Vendedor", "Preço", "Cia aérea", "Bagagem", "Menor preço CVC no trecho", "Menor preço do trecho", "Lugar da CVC em preço"];
  const linhas = [];
  for (const h of lidos) {
    const ord = h.datas.map((d, i) => [d, i]).sort((x, y) => (x[0].preco - y[0].preco) || (x[1] - y[1])).map(([d]) => d);
    const r = h.resumo;
    ord.forEach((d, i) => linhas.push([...dataHora(h.quando), tituloPost(h), `${h.de_nome} (${h.de})`, `${h.para_nome} (${h.para})`,
      nomeMes(d.mes), dataCompleta(d.ida, d.mes), dataCompleta(d.volta, d.mes, Number(String(d.ida).split("/")[1])), d.estadia, i + 1, d.vendedor.rotulo, num(d.preco), d.cia, bagagem(d.bagagem),
      num(r.cvc_menor), num(r.menor), r.cvc_lugar_preco ? `${r.cvc_lugar_preco} de ${r.vendedores}` : "sem CVC"]));
  }
  return tabela(cab, linhas);
}
const hoje = () => new Date().toISOString().slice(0, 10);
let limparArmado = 0;
async function limpa(b) {
  if (Date.now() - limparArmado > 4000) { limparArmado = Date.now(); b.textContent = "Clique de novo para apagar"; return; }
  await chrome.storage.local.remove(historico.concat(historicoVoos).map((h) => h.chave));
}
function cartaoHistorico() {
  const n = historico.length, tr = historico.reduce((s, h) => s + h.trechos.length, 0);
  const nv = historicoVoos.length, dt = historicoVoos.reduce((s, h) => s + h.datas.length, 0);
  return `<h2>Histórico</h2><div class="cartao">
    <div><b>${n}</b> post(s) · ${tr} trecho(s) <span class="fraco">— uma leitura por post por dia</span></div>
    <div><b>${nv}</b> trecho(s) com datas · ${dt} preço(s) com vendedor</div>
    <div class="botoes"><button id="h-exp" ${n ? "" : "disabled"}>Excel dos posts</button>
      <button id="h-expv" ${nv ? "" : "disabled"}>Excel dos preços por vendedor</button>
      <button id="h-limpa" ${n + nv ? "" : "disabled"}>Limpar histórico</button></div></div>`;
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

// ---- pagina "ver datas" ----------------------------------------------------- #
const tagDif = (d) => (d == null ? '<span class="fraco">—</span>'
  : `<span class="tag ${d <= 0 ? "bom" : "ruim"}">${d > 0 ? "+" : ""}${d.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: Math.abs(d) < 1 ? 2 : 1 })}%</span>`);
const nomeMes = (m) => { const [a, n] = m.split("-"); return `${["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][Number(n) - 1]}/${a}`; };

function kpisVoos(e) {
  const r = e.resumo;
  const cvc = r.cvc_lugar_preco
    ? `<div class="kpi cvc"><b>${brl(r.cvc_menor)}</b><span>preço CVC · ${ord(r.cvc_lugar_preco)} de ${r.vendedores} em preço</span></div>`
    : `<div class="kpi sem-cvc"><b>Sem CVC</b><span>nenhuma data da CVC</span></div>`;
  return `<div class="kpis">
    <div class="kpi"><b>${r.datas}</b><span>datas com preço</span></div>
    <div class="kpi"><b>${brl(r.menor)}</b><span>menor do trecho</span></div>
    ${cvc}</div>`;
}

function cartaoCvcVoos(e) {
  const r = e.resumo;
  if (!r.datas) return "";
  if (!r.cvc_datas) {
    return `<h2>CVC neste trecho</h2><div class="cartao"><div class="aviso" style="margin-top:0">A CVC não tem nenhuma data
      ${e.vendedores.cvc ? "neste trecho, embora esteja no buscador do post" : "e não está no buscador do post"}.</div></div>`;
  }
  return `<h2>CVC neste trecho</h2><div class="cartao cvc-borda">
    <div class="comp"><span class="suave">menor preço da CVC</span><span></span><span class="valor">${brl(r.cvc_menor)}</span></div>
    <div class="comp"><span class="suave">lugar em preço entre os vendedores</span><span></span><span class="valor">${ord(r.cvc_lugar_preco)} de ${r.vendedores}</span></div>
    <div class="comp"><span class="suave">1ª oferta da CVC na lista do site</span><span></span><span class="valor">${ord(r.cvc_posicao_lista)} de ${r.datas}</span></div>
    <div class="comp"><span class="suave">datas da CVC</span><span></span><span class="valor">${r.cvc_datas} de ${r.datas} (${pct(r.cvc_datas / r.datas * 100)})</span></div>
    <div class="fraco nota">Lista do site em ordem de preço (padrão da página). Cada data mostra um vendedor só, o mais barato dela.</div></div>`;
}

function comparativoVoos(e) {
  const r = e.resumo;
  if (!r.comparativo.length) return "";
  const linhas = r.comparativo.map((c) => `<div class="comp m">${marca(c)}<span class="valor">${brl(c.menor)}</span><span>${tagDif(c.dif)}</span></div>`).join("");
  return `<h2>Comparativo de preço</h2><div class="cartao">
    <div class="comp m"><span class="marca cvc">CVC</span><span class="valor">${brl(r.cvc_menor)}</span><span class="fraco">base</span></div>${linhas}
    <div class="fraco nota">% = CVC acima (+) ou abaixo (−) do menor preço do player: (CVC − player) ÷ player.</div></div>`;
}

function porVendedor(e) {
  const r = e.resumo;
  if (!r.datas) return "";
  const max = Math.max(1, ...r.por_vendedor.map((v) => v.datas));
  const linhas = r.por_vendedor.map((v) => `<div class="linha-barra">${marca(v)}
    <span class="barra"><i class="${esc(v.cor || "")}" style="width:${(v.datas / max * 100).toFixed(1)}%"></i></span><b>${v.datas}</b></div>`).join("");
  return `<h2>Datas por vendedor</h2><div class="cartao">${linhas}</div>`;
}

function mesesVoos(e) {
  if (!e.meses.length) return "";
  const lidos = new Set(e.resumo.meses_lidos);
  const itens = e.meses.map((m) => `<div class="mes ${lidos.has(m.mes) ? "lido" : ""}"><span>${esc(nomeMes(m.mes))}</span><b>${brl(m.preco)}</b></div>`).join("");
  return `<h2>Meses do trecho</h2><div class="cartao"><div class="meses">${itens}</div>
    <div class="fraco nota">Em destaque: meses com datas lidas. Clique em outro mês no site para incluí-lo.</div></div>`;
}

function datasVoos(e) {
  const lista = e.datas.map((d, i) => [d, i]).sort((x, y) => (x[0].preco - y[0].preco) || (x[1] - y[1])).map(([d]) => d);
  if (!lista.length) return "";
  const itens = lista.slice(0, 40).map((d, i) => `<div class="trecho"><span class="pos">${i + 1}º</span>
    <span>${esc(d.ida)} → ${esc(d.volta)} <span class="fraco">· ${d.estadia ?? "—"} dias</span></span>${marca(d.vendedor)}
    <span class="p">${brl(d.preco)}</span></div>`).join("");
  const mais = lista.length > 40 ? `<div class="fraco nota">+${lista.length - 40} datas — todas vão no Excel</div>` : "";
  return `<h2>Datas · ordem de preço do site</h2><div class="cartao">${itens}${mais}</div>`;
}

function diagnosticoVoos(e) {
  const desc = e.desconhecidos.length
    ? `<div class="suave" style="margin-top:6px">Vendedor fora do catálogo: ${e.desconhecidos.map((c) => `<code>${esc(c)}</code>`).join(" ")}</div>` : "";
  return `<details data-k="diag"><summary>Diagnóstico</summary>
    <div class="suave">Página “ver datas” · ${e.datas.length} data(s) · meses lidos: ${esc(e.resumo.meses_lidos.map(nomeMes).join(", ") || "—")}
      · às ${esc(new Date(e.quando).toLocaleTimeString("pt-BR"))}</div>${desc}
    <div class="botoes"><button id="d-baixar">Baixar página (HTML)</button></div></details>`;
}

// No post: o que ja foi medido nos "ver datas" dos trechos dele
function trechosMedidos(e) {
  const url = e.url.replace(/[?#].*$/, "");
  const ultimos = new Map();
  for (const h of historicoVoos) if (h.post_url === url) ultimos.set(`${h.de}-${h.para}`, h);
  if (!ultimos.size) return `<div class="fraco nota">Para ver o preço da CVC, clique em “ver datas” num trecho do post.</div>`;
  const linhas = [...ultimos.values()].map((h) => { const r = h.resumo, c = r.comparativo[0];
    return `<div class="comp"><span>${esc(h.de_nome)} → ${esc(h.para_nome)}</span>
      <span class="valor">${r.cvc_menor == null ? '<span class="fraco">sem CVC</span>' : `${brl(r.cvc_menor)} · ${ord(r.cvc_lugar_preco)}`}</span>
      <span>${c ? tagDif(c.dif) : ""}</span></div>`; }).join("");
  return `<div class="rotulo" style="margin-top:10px">Preço da CVC nos trechos abertos</div>${linhas}
    <div class="fraco nota">% contra o player mais barato do trecho.</div>`;
}

function desenhaVoos(e) {
  const quando = new Date(e.quando);
  const post = tituloPost(e);
  return `<div class="pagina">${esc(e.de_nome)} → ${esc(e.para_nome)}</div>
    <div class="meta">Ver datas · ${e.ida_e_volta ? "ida e volta" : "só ida"} · lido ${esc(quando.toLocaleDateString("pt-BR"))}
      ${esc(quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}</div>
    ${post ? `<div class="meta">Post: ${esc(post)}</div>` : ""}`
    + kpisVoos(e) + cartaoCvcVoos(e) + comparativoVoos(e) + porVendedor(e) + mesesVoos(e) + datasVoos(e) + cartaoHistorico() + diagnosticoVoos(e);
}

function desenha(e) {
  if (!e || !e.vendedores) return;   // nada lido ainda (ou leitura da versao 0.1)
  const aberto = !!(app.querySelector("details[open]"));
  if (e.pagina === "voos") {
    app.innerHTML = topo() + desenhaVoos(e);
  } else {
    const quando = new Date(e.quando);
    const cab = `<div class="pagina">${esc(e.titulo)}</div>
      <div class="meta">Post de promoção · ${e.tipo === "pacote" ? "pacotes" : e.ida_e_volta === false ? "passagens só ida" : "passagens ida e volta"}
        · lido ${esc(quando.toLocaleDateString("pt-BR"))} ${esc(quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}</div>`;
    app.innerHTML = topo() + cab + kpis(e) + cartaoCvc(e) + buscador(e) + precos(e) + trechos(e) + cartaoHistorico() + diagnostico(e);
  }
  if (aberto && app.querySelector("details")) app.querySelector("details").open = true;
  const b = (id) => document.getElementById(id);
  if (b("h-exp")) b("h-exp").onclick = () => arquivo(csvPosts(historico), `afiliados-posts-${hoje()}.csv`);
  if (b("h-expv")) b("h-expv").onclick = () => arquivo(csvVoos(historicoVoos), `afiliados-precos-por-vendedor-${hoje()}.csv`);
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
  if (Object.keys(mud).some((k) => k.startsWith("afh:") || k.startsWith("afv:"))) await carregaHistorico();
  if (mud.af_estado) ultimo = mud.af_estado.newValue;
  desenha(ultimo);
});
