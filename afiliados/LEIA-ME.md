# Afiliados CVC — posts de promocao do Melhores Destinos

Extensao Chrome **separada** do Metabuscadores (manifesto, icone, painel e
historico proprios). Mede **so o post de promocao**
(`www.melhoresdestinos.com.br/promocao/<slug>`) que voce abre no seu Chrome e
mostra, no painel lateral:

- **trechos com preco** da promocao e o **menor preco** (confere com o
  "a partir de" do titulo);
- **CVC no buscador**: se a CVC esta entre os vendedores do buscador do post,
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

**Limite: o post nao diz de qual vendedor e cada preco.** A tabela traz o
menor preco de cada trecho, sem vendedor. Por isso o comparativo de preco
CVC x Player **nao sai desta pagina** — o painel diz isso em vez de inventar.

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
| `leitor.js` | le o post: dados da promocao, vendedores do buscador, trechos; resumo por destino/origem |
| `coletor.js` | content script so em `/promocao/*`: le ao abrir e quando a tabela carrega; grava estado e historico |
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
