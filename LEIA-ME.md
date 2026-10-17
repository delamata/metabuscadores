# Metabuscadores CVC — Skyscanner e Kayak, busca manual, analise no painel

**Voce** faz a busca no Skyscanner ou no Kayak, no seu Chrome de sempre. A
extensao **reconhece o site ao entrar**, le o corpo das respostas de busca que a
propria pagina pediu, roda a analise e mostra no painel lateral.

| site | URL de busca reconhecida |
|---|---|
| Skyscanner | `skyscanner.com.br/transporte/passagens-aereas/saoa/rioa/260917/260924/` (e `.net/transport/flights/...`) |
| Kayak | `kayak.com.br/flights/SAO-RIO/2026-09-17/2026-09-24/2adults` |

O Kayak **nao** usa o formato do Skyscanner: o poll
(`/i/api/search/dynamic/flights/poll`) traz `results[]` com os precos por
agencia em `bookingOptions` / `optionsByFare[].options`, cada um com
`providerInfo {code, displayName}` e `displayPrice {price}`, e as companhias
por referencia (`legs` -> `segments` -> `airlines`). `CVC.doKayak` traduz isso
para `itineraries/pricingOptions/agentIds`, entao a analise continua **uma so**.
A CVC e reconhecida pelo nome/codigo do provedor (`/\bcvc\b/i`, ex. "CVC Viagens")
e vira o agente `cvc_`.

Se um site mudar de formato, o painel avisa "Nenhuma resposta de busca foi
reconhecida" e o botao **Baixar respostas capturadas** (tambem no Diagnostico)
salva as ultimas 8 respostas cruas num `.json` — e com esse arquivo que o
leitor e ajustado, com dado real e nao com palpite. O
icone ganha o selo **SKY** ou **KYK** quando o site e reconhecido, e o painel
mostra de qual site veio a busca.

## O que o painel mostra

1. **CVC x Decolar** — no topo, lado a lado: o menor preco da CVC e o menor
   preco da Decolar na busca, e a diferenca em % ("CVC 6,7% mais cara que a
   Decolar"). A % e sobre o preco da Decolar: `(CVC - Decolar) / Decolar`.
   Logo abaixo, o **frente a frente**: nos voos que as duas vendem, em quantos
   cada uma e mais barata.
2. **Numeros da busca** — voos com CVC, cobertura e a 1a posicao em Recomendados.
3. **Por companhia** — menor preco CVC x menor preco Decolar, a diferenca em %,
   a cobertura e o selo de tempo da fonte no ConectaAS (vermelho quando deu
   timeout).
4. **Posicoes**, **combinacoes de companhias** e, recolhidos, o **log do
   ConectaAS** (links para o Kibana) e o **diagnostico**.

A Decolar e localizada pelo nome ou id do agente (`RIVAL` no topo do
`coletor.js`: `/decolar/i`), que funciona nos dois sites. Para comparar com
outra agencia, troque o `RIVAL`. Se a Decolar nao estiver na busca, o painel
avisa. Uma oferta dividida entre a CVC e a Decolar conta para as duas.

A comparacao com a Decolar e campo novo da analise e **ainda nao existe no
Python** (`robo_cia_skyscanner.py`); os numeros que ja existiam nao mudaram.

O icone fica em `icones/` (`icone.svg` e a fonte; os PNG 16/32/48/128 sao
gerados dele — o de 16 px sai sem o selo laranja, que nesse tamanho vira borrao).

**Nao precisa de servidor local.** A analise roda em `analise.js` e o log do
ConectaAS e consultado pelo service worker (`host_permissions` no proxy
Elasticsearch — precisa de VPN).

## Instalar

1. `chrome://extensions` -> ligar **Modo do desenvolvedor**
2. **Carregar sem compactacao** -> escolher esta pasta
3. fixar o icone na barra e clicar -> abre o **painel lateral**
4. pesquisar no Skyscanner ou no Kayak normalmente

## As pecas

| arquivo | mundo | papel |
|---|---|---|
| `gancho.js` | MAIN | envolve `fetch`/`XHR` em `Proxy` e le um clone da resposta |
| `analise.js` | ISOLATED (+ painel) | reconhece o site, le a rota da URL e faz as contas (porte de `robo_cia_*.py`) |
| `coletor.js` | ISOLATED | junta os polls, fecha a busca, publica o resultado |
| `servico.js` | service worker | chama o proxy ES e pinta o selo do icone (fora do caminho critico) |
| `painel.html`/`painel.js` | painel | so desenha (tema claro e escuro, segue o sistema) |
| `icones/` | — | icone da extensao |

O payload **nunca sai da aba**: o coletor escreve o resultado (alguns KB) direto
em `chrome.storage.local`, de onde o painel le. O service worker NAO esta no
caminho do estado: se ele quebrar, perde-se a coluna de tempo por fonte, nao o painel.

Com Skyscanner e Kayak abertos ao mesmo tempo, so a aba **visivel** publica a
batida periodica — senao as duas se alternariam no painel.

## CONFERIR antes de usar

- **`ES_URL` em `servico.js`** — o `servico.js` original nao veio junto, entao o
  endpoint foi reescrito como `https://api-java-soap-partnership.k8s-cvc.com.br/_search`.
  Se o original usava outro path (indice, `/api/...`), troque a constante.
- **Agente** — `AGENTE = "cvc_"` em `coletor.js` vale para os dois sites. Se no
  Kayak a CVC tiver outro id em `agentIds`, o painel avisa
  ("O agente cvc_ nao aparece na lista de agentes desta busca").
- **Kayak com varios aeroportos** (`GRU,CGH-RIO`) usa o primeiro codigo na
  consulta ao log, que tem uma rota so.

## Quando a busca e considerada encerrada

- enquanto nenhum poll trouxer `status=complete`, espera ate `ESPERA` (120s)
  contados do primeiro poll;
- depois do primeiro `complete`, ouve so `CARENCIA` (12s): a janela das ofertas
  atrasadas de uma agencia.

Constantes no topo do `coletor.js`.

## Diagnostico (o `<details>` no fim do painel)

- **corpos capturados** — o que o gancho conseguiu ler
- **requisicoes vistas** — tudo que bate `search|radar|poll|itiner|flights|conductor|fps`,
  mesmo o que o gancho nao le. Se cresce e "corpos" fica parado, os polls estao fora do alcance.
- **Web Workers / service worker do site** — um content script nao alcanca o
  interior de um worker; se o polling morar la, o caminho e `chrome.debugger`.

## Fonte em timeout (por que GOL e SGOL, e so SGOL)

Fonte que da timeout **nao loga duration**. O aviso vive noutro documento
(`CorrelationId: <uuid> GwAereo consulting fail with source SGOL ... within 6000ms`),
sem campo `correlationId` — por isso a segunda consulta e um `match_phrase` em
`message`. Medido no correlationId `8f022474` (2026-08-21): com a SGOL em
timeout, a GOL aparecia com os 10 ms do GLL. Fonte errada com numero bonito e
pior que fonte nenhuma; o teste `GOL em timeout nao herda...` trava isso.

## Testes

```bash
npm test        # node --test, sem dependencias
npm run check   # sintaxe de todos os scripts + testes
```

As contas continuam espelhando `robo_cia_skyscanner.py` / `robo_cia_kibana.py`:
se mexer em uma, mexa na outra.

## Politica corporativa

`ExtensionInstallBlocklist` pode impedir carregar sem compactacao; nesse caso e
pedido para o TI liberar por ID.
