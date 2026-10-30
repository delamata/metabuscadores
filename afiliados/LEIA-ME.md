# Afiliados CVC — posts de promocao do Melhores Destinos

Extensao Chrome **separada** do Metabuscadores (manifesto, icone, painel e
historico proprios). Mede **so o post de promocao**
(`www.melhoresdestinos.com.br/promocao/<slug>`) que voce abre no seu Chrome e
mostra, no painel lateral:

- **trechos com preco** da promocao e o **menor preco** (confere com o
  "a partir de" do titulo);
- **CVC neste post**: posicao da CVC na lista do buscador (ex.: 5o de 5), a vez
  dela no botao "Pesquisar" e o preco da CVC (o post nao informa); se a CVC esta entre os vendedores do buscador do post,
  quais concorrentes estao (como Player N) e **qual deles o botao "Pesquisar"
  abre** (prioridade fixa do site: Player 1 > Player 11 > CVC > Player 7 >
  Player 10);
- **preco por destino** (menor, maior, quantidade de trechos) e a mediana;
- a lista de trechos (origem -> destino, do mais barato), o **historico** (uma
  leitura por post por dia) e **Exportar para Excel** (uma linha por trecho).

So **le o que o site ja mostrou**: nao faz requisicao nenhuma ao site.

## De onde vem cada dado (calibrado com o HAR do post de 30/10/2026)

| dado | onde esta no post |
|---|---|
| vendedores do buscador | `<script>` inline: `var promo = {..."search_engine_configuration":{"providers":["viajanet","latam","decolar","gol","cvc"]}}` |
| quem o botao abre | regra do `motor-post-passagensaereas.js`: decolar > latam > cvc > viajanet > gol (padrao: decolar) |
| trechos e precos | tabela que o site monta (`.ls-trechos-linha`, atributos `from`/`to`/`from_name`/`to_name`, preco em `.lt2`) a partir do `cheapest_prices_json` |

**O post nao diz de qual vendedor e cada preco** (a tabela traz o menor preco
de cada trecho, sem vendedor). O preco de cada vendedor esta na pagina
**"ver datas"** de um trecho (`/voos?rota=DE/PARA/chave`), que o addon tambem le:

| dado | de onde vem |
|---|---|
| datas, preco e **vendedor** de cada uma | resposta de `/passagens_json/DE/PARA/?key=...` que a propria pagina pede (ao abrir e a cada mes clicado), copiada por `gancho.js` (mundo MAIN) — nenhuma requisicao nova |
| posicao | a lista do site, que por padrao vem em ordem de preco |

No painel do "ver datas": **preco da CVC**, **lugar da CVC em preco** entre os
vendedores, **1a oferta da CVC na lista**, datas de cada vendedor (a CVC em
quantas), **comparativo** CVC x cada Player `(CVC - player) / player`, os
meses do trecho e a lista de datas. Cada mes clicado no site soma na leitura.
De volta ao post, o cartao "CVC neste post" mostra o preco da CVC em cada
trecho ja aberto. Excel: **"Excel dos posts"** (uma linha por trecho do post)
e **"Excel dos precos por vendedor"** (uma linha por data, com vendedor,
posicao, cia e bagagem).

**Posicao da CVC (clicavel).** O painel diz se a CVC foi **citada** e em
qual posicao: na lista do buscador do post (ex.: 5o de 5) e no texto do post
(ordem da primeira citacao entre as agencias/cias do catalogo; o texto lido
e o visivel, sem os `<script>`). Clicando na posicao abre o **detalhe**:
quantidade de ofertas (datas com vendedor), ofertas da CVC, os concorrentes
e a **cobertura** de cada um (% das ofertas em que aparece e em quantos
trechos abertos tem ao menos uma data). No post, o detalhe soma todos os
"ver datas" ja abertos dele; no "ver datas", vale o trecho.

Se voce filtrar a tabela no site (origem/destino), a leitura nao muda: vale a
promocao inteira.

**So a CVC aparece com o nome real.** Os concorrentes sao "Player N", com o
**mesmo numero do Metabuscadores** (Decolar = Player 1, ViajaNet = 7, GOL =
10, LATAM = 11... — ver `catalogo.js`). O titulo do post passa por uma
mascara que troca o nome de cada agencia/cia pelo rotulo. Vendedor fora do
catalogo aparece como "Player ?" (o codigo so no Diagnostico). A coluna
"Pagina" do Excel e a URL do proprio Melhores Destinos e pode citar a cia no
endereco.

## Pecas

| arquivo | papel |
|---|---|
| `catalogo.js` | agencias, numero do Player, dominios, cores e a mascara de nomes |
| `gancho.js` | mundo MAIN, so no "ver datas": copia a resposta de `/passagens_json/` para o coletor |
| `leitor.js` | le o post (promocao, buscador, trechos) e o "ver datas" (preco e vendedor de cada data, posicao, comparativo) |
| `coletor.js` | content script em `/promocao/*` e `/voos`: le, grava estado e historico |
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
