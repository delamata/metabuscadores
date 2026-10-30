# Afiliados CVC — promocoes do Melhores Destinos

Extensao Chrome **separada** do Metabuscadores (manifesto, icone, painel e
historico proprios). Le as promocoes do **www.melhoresdestinos.com.br** que voce
abre no seu Chrome e mostra, no painel lateral:

- **quantidade de ofertas** na pagina: total, com a CVC e de concorrentes;
- **ofertas por player** (barras, CVC sempre na lista);
- **comparativo de preco**: menor preco da CVC x menor preco de cada player,
  `(CVC - player) / player` — a mesma conta do Metabuscadores (+ vermelho =
  CVC mais cara);
- a lista de ofertas, o **historico** (uma linha por pagina por dia) e
  **Exportar para Excel** (uma linha por oferta, CSV pt-BR).

So **le o que o site ja mostrou**: nao faz requisicao nenhuma ao site.

**So a CVC aparece com o nome real.** Os concorrentes sao "Player N", com o
**mesmo numero do Metabuscadores** (Decolar = Player 1, Zupper = 2, MaxMilhas
= 3, 123milhas = 4... — ver `catalogo.js`). Os textos do site (titulos,
botoes) passam por uma mascara que troca o nome de cada agencia do catalogo
pelo rotulo ("Ver na Decolar" -> "Ver na Player 1"). Agencia fora do
catalogo (ex.: Hoteis.com) aparece como o site escreve. A coluna "Pagina" do
Excel e a URL do proprio Melhores Destinos e pode citar a agencia no endereco.

## Tipos de pagina

| pagina | o que le | estado |
|---|---|---|
| **Lista** (home, listagens) | cada card de `/promocao/<slug>`: titulo (`h2` / `.titulo-loop`), preco "a partir de", tipo (passagem, pacote, hotel...), data (`.card-data-novo`) e a agencia/cia **citada no titulo** | calibrado com o HAR real da home (30/10/2026) |
| **Post** (`/promocao/<slug>`) | os links de compra: agencia pelo dominio do link (inclusive dentro de redirect de afiliado, `?url=https%3A%2F%2Fwww.cvc.com.br...`) e o preco mais proximo do link; e o "Resumo da oferta: Preco: a partir de R$..." | **leitor generico, ainda nao calibrado** com um post real |

Na home, o vendedor quase nunca esta no titulo do card (fica dentro do post):
essas ofertas contam como "sem agencia identificada".

Para calibrar com uma pagina real: **Diagnostico -> Baixar pagina (HTML)**.
O Diagnostico tambem lista os links externos que o leitor nao reconheceu.

## Pecas

| arquivo | papel |
|---|---|
| `catalogo.js` | agencias, numero do Player, dominios, cores e a mascara de nomes |
| `leitor.js` | le lista e post; preco, tipo, agencia do link; resumo e comparativo |
| `coletor.js` | content script: le ao abrir e quando o site carrega mais cards; grava estado e historico |
| `painel.html`/`painel.js` | painel lateral (tema claro e escuro) |
| `servico.js` | abre o painel pelo icone; selo "AF" nas abas do Melhores Destinos |
| `icones/` | identidade CVC com etiqueta de oferta (diferente do Metabuscadores) |

## Instalar

`chrome://extensions` -> Modo do desenvolvedor -> **Carregar sem compactacao**
-> pasta `afiliados`. Instala ao lado do Metabuscadores, sem conflito.

## Testes

```bash
cd afiliados && npm test        # node --test
```
