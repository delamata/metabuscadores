// Relatorio da rotina automatica: so desenha. Os numeros saem de
// ROTINA.consolida (rotina.js), a partir das rodadas guardadas e do historico.
// So a CVC aparece com o nome real; os concorrentes, como "Player N".
const rel = document.getElementById("rel");

const esc = (v) => String(v ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pct1 = (v) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const dif = (d) => `${d > 0 ? "+" : ""}${pct1(d)}`;
const dia = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${m[3]}/${m[2]}` : "—"; };
const cob = (n, t) => (n == null || !t ? "—" : pct1(n / t * 100));
const tagVar = (v) => (v == null ? '<span class="tag neutro">—</span>'
  : `<span class="tag ${v <= 0 ? "bom" : "ruim"}">${dif(v)}</span>`);
const curto = (id) => { const m = /^\d{4}-(\d{2})-(\d{2}) (.+)$/.exec(id || ""); return m ? `${m[2]}/${m[1]} ${m[3]}` : esc(id); };
const ST = { ok: "ok", sem_dados: "sem dados", bloqueio: "verificação de robô", aba_fechada: "aba fechada",
             cancelada: "cancelada", pendente: "não buscada", aberta: "interrompida" };

function kpis(d) {
  const k = d.kpis;
  const taxa = k.comparaveis ? `${Math.round(k.cvcMaisBarata / k.comparaveis * 100)}%` : "—";
  return `<div class="kpis">
    <div class="kpi"><b>${k.rodadas}</b><span>rodadas</span></div>
    <div class="kpi"><b>${k.buscas}</b><span>buscas lidas</span></div>
    <div class="kpi"><b>${taxa}</b><span>CVC mais barata que o Player 1 (${k.cvcMaisBarata} de ${k.comparaveis})</span></div>
    <div class="kpi"><b>${k.mediaVariacao == null ? "—" : dif(k.mediaVariacao)}</b><span>variação média CVC × Player 1</span></div>
  </div>`;
}

function ultima(d) {
  const u = d.ultima;
  if (!u) return "";
  const linhas = u.itens.map((it) => {
    const l = it.linha;
    if (!l) return `<tr><td class="rota"><b>${esc(it.rota)}</b></td><td colspan="8" class="suave">${esc(ST[it.status] || it.status)}</td></tr>`;
    const semCvc = (l.sem_cvc || []).map((x) => `<div class="pequeno"><b>${esc(x.cia)}:</b> ${esc(x.motivo)}</div>`).join("");
    return `<tr>
      <td class="rota"><b>${esc(l.rota)}</b><div class="fraco pequeno">${dia(l.ida)}${l.volta ? ` → ${dia(l.volta)}` : " · só ida"}</div></td>
      <td class="num">${brl(l.preco_cvc)}</td>
      <td class="num">${brl(l.preco_decolar)}</td>
      <td class="num">${tagVar(l.variacao_pct)}</td>
      <td class="num">${cob(l.voos_cvc, l.voos_busca)}</td>
      <td class="num">${cob(l.voos_decolar, l.voos_busca)}</td>
      <td>${l.menor_busca == null ? "—" : `${brl(l.menor_busca)}<div class="fraco pequeno">${esc(l.agencia_menor)}</div>`}</td>
      <td>${semCvc || '<span class="fraco">—</span>'}</td>
    </tr>`;
  }).join("");
  const aviso = u.resumo && u.resumo.bloqueada
    ? '<div class="aviso" style="margin-bottom:10px">O Kayak pediu verificação de robô nesta rodada e ela foi interrompida. Nada foi contornado — vale abrir o Kayak manualmente e reduzir a frequência.</div>' : "";
  return `<h2>Última rodada · ${curto(u.id)}</h2>${aviso}<div class="cartao rolagem"><table>
    <thead><tr><th>Rota</th><th class="num">CVC</th><th class="num">Player 1</th><th class="num">% CVC</th>
      <th class="num">Cob. CVC</th><th class="num">Cob. Player 1</th><th>Concorrente + Barato</th><th>Cias sem CVC (motivo)</th></tr></thead>
    <tbody>${linhas}</tbody></table>
    <div class="fraco pequeno" style="margin-top:8px">% CVC = (preço CVC − preço Player 1) ÷ preço Player 1. Verde: CVC mais barata.</div></div>`;
}

function evolucao(d) {
  if (!d.recentes.length) return "";
  const cab = d.recentes.map((r) => `<th class="cel">${curto(r.id)}</th>`).join("");
  const linhas = d.matriz.map((m) => `<tr><td class="rota"><b>${esc(m.rota)}</b></td>${m.celulas.map((c) => {
    if (c.linha) return `<td class="cel" title="CVC ${esc(brl(c.linha.preco_cvc))} · Player 1 ${esc(brl(c.linha.preco_decolar))}">${tagVar(c.linha.variacao_pct)}</td>`;
    return `<td class="cel fraco pequeno">${c.status ? esc(ST[c.status] || c.status) : "—"}</td>`;
  }).join("")}</tr>`).join("");
  return `<h2>Evolução por rota · % CVC × Player 1 nas últimas ${d.recentes.length} rodadas</h2>
    <div class="cartao rolagem"><table><thead><tr><th>Rota</th>${cab}</tr></thead><tbody>${linhas}</tbody></table>
    <div class="fraco pequeno" style="margin-top:8px">Passe o mouse numa célula para ver os preços.</div></div>`;
}

function listaRodadas(d) {
  const linhas = d.rodadas.slice().reverse().slice(0, 30).map((r) => `<tr>
    <td>${curto(r.id)}</td><td>${esc(r.origem === "agenda" ? "agendada" : "manual")}</td>
    <td>${esc(r.resumo ? r.resumo.texto : "")}</td></tr>`).join("");
  return `<h2>Rodadas</h2><div class="cartao rolagem"><table>
    <thead><tr><th>Rodada</th><th>Origem</th><th>Resumo</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}

function exporta(d) {
  const blob = new Blob([HIST.csv(d.linhas)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `metabuscadores-rotina-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function desenha() {
  const tudo = await chrome.storage.local.get(null);
  const d = ROTINA.consolida(tudo.rodadas || [], HIST.deStorage(tudo), 9);
  const c = ROTINA.config(tudo.rotina);
  const periodo = d.rodadas.length
    ? `${curto(d.rodadas[0].id)} a ${curto(d.rodadas[d.rodadas.length - 1].id)}` : "nenhuma rodada ainda";
  rel.innerHTML = `<header>
      <img src="icones/icone128.png" alt="">
      <h1>Relatório da rotina — Metabuscadores CVC</h1>
      <div class="nao-imprime"><button id="b-exporta">Exportar Excel</button> <button class="prim" id="b-imprime">Imprimir / PDF</button></div>
    </header>
    <p class="sub">${esc(periodo)} · ${c.rotas.length} rotas no Kayak às ${c.horarios.map(ROTINA.rotuloHorario).join(", ")}
      · ida em +${c.dias_ida} dias${c.noites ? `, ${c.noites} noites` : ", só ida"} · ${c.adultos} adulto(s).
      Só a CVC aparece com o nome real; concorrentes como Player N (Player 1 = referência da comparação).</p>
    ${d.rodadas.length ? kpis(d) + ultima(d) + evolucao(d) + listaRodadas(d)
      : '<div class="cartao vazio" style="margin-top:18px">Ainda não há rodadas. Use “Rodar agora” no painel ou aguarde o próximo horário.</div>'}
    <p class="fraco pequeno" style="margin-top:24px">Gerado em ${esc(new Date().toLocaleString("pt-BR"))}.</p>`;
  const ex = document.getElementById("b-exporta");
  if (ex) ex.onclick = () => exporta(d);
  document.getElementById("b-imprime").onclick = () => window.print();
}

desenha();
chrome.storage.onChanged.addListener((mud, area) => {
  if (area === "local" && (mud.rodadas || mud.rotina)) desenha();
});
