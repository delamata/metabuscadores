// Catalogo das agencias para o Afiliados: o MESMO numero de Player do addon
// Metabuscadores (Decolar = Player 1...), mais os dominios de cada uma, para
// reconhecer o link de compra. So a CVC aparece com o nome real.
var CATALOGO = (() => {
  const CVC = { id: "cvc", rotulo: "CVC", cor: "cvc", re: /\bcvc\b/i, dominios: ["cvc.com.br"] };
  const AGENCIAS = [
    { numero: 1, re: /decolar/i, dominios: ["decolar.com"], cor: "rival" },
    { numero: 2, re: /zupper/i, dominios: ["zupper.com.br"], cor: "tiffany" },
    { numero: 3, re: /max\s*milhas/i, dominios: ["maxmilhas.com.br"], cor: "maxmilhas" },
    { numero: 4, re: /123\s*milhas/i, dominios: ["123milhas.com", "123milhas.com.br"], cor: "milhas123" },
    { numero: 5, re: /vai\s*de\s*promo/i, dominios: ["vaidepromo.com.br"] },
    { numero: 6, re: /\btrip\.com\b/i, dominios: ["trip.com"] },
    { numero: 7, re: /viaja\s*net/i, dominios: ["viajanet.com.br"] },
    { numero: 8, re: /booking/i, dominios: ["booking.com"] },
    { numero: 9, re: /\bazul\b/i, dominios: ["voeazul.com.br", "azulviagens.com.br"], cor: "azulcia" },
    { numero: 10, re: /\bgol\b|voegol/i, dominios: ["voegol.com.br"], cor: "gol" },
    { numero: 11, re: /latam/i, dominios: ["latam.com", "latamairlines.com"], cor: "latam" },
    { numero: 12, re: /gotogate/i, dominios: ["gotogate.com.br", "gotogate.com"] },
    { numero: 13, re: /mytrip/i, dominios: ["mytrip.com"] },
    { numero: 14, re: /kiwi\.com|\bkiwi\b/i, dominios: ["kiwi.com"] },
    { numero: 15, re: /submarino/i, dominios: ["submarinoviagens.com.br"] },
    { numero: 16, re: /edreams/i, dominios: ["edreams.com.br", "edreams.com"] },
    { numero: 17, re: /expedia/i, dominios: ["expedia.com.br", "expedia.com"] },
    { numero: 18, re: /smiles/i, dominios: ["smiles.com.br"] },
    { numero: 19, re: /passagens\s*promo/i, dominios: ["passagenspromo.com.br"] },
    { numero: 20, re: /hurb/i, dominios: ["hurb.com"] },
    { numero: 21, re: /kissandfly/i, dominios: ["kissandfly.com.br", "kissandfly.com"] },
    { numero: 22, re: /voopter/i, dominios: ["voopter.com.br"] },
    { numero: 23, re: /edestinos/i, dominios: ["edestinos.com.br"] },
  ].map((a) => Object.assign({ id: `p${a.numero}`, rotulo: `Player ${a.numero}`, cor: a.cor || null }, a));
  const TODAS = [CVC, ...AGENCIAS];

  // host "www.decolar.com" bate em "decolar.com"; "decolar.com.ar" nao
  const hostBate = (host, dom) => host === dom || host.endsWith(`.${dom}`);
  const porHost = (host) => TODAS.find((a) => a.dominios.some((d) => hostBate(String(host || "").toLowerCase(), d))) || null;
  // agencias citadas num texto (titulo do card, texto do botao)
  const noTexto = (texto) => TODAS.filter((a) => a.re.test(texto || ""));
  const porId = (id) => TODAS.find((a) => a.id === id) || null;

  // So a CVC com nome real: troca o nome de cada concorrente do catalogo, num
  // texto do site (titulo, botao), pelo rotulo dele. "Ver na Decolar" ->
  // "Ver na Player 1"; "Booking.com" -> "Player 8".
  const MASCARAS = AGENCIAS.map((a) => [new RegExp(`(?:${a.re.source})(?:\\.com(?:\\.br)?)?`, "gi"), a.rotulo]);
  const mascara = (texto) => MASCARAS.reduce((t, [re, rot]) => t.replace(re, rot), String(texto || ""));

  return { CVC, AGENCIAS, TODAS, porHost, noTexto, porId, mascara };
})();

if (typeof module !== "undefined") module.exports = CATALOGO;   // para os testes
