# Estúdio de Animação

App local para transformar roteiros em livros animados com narração e trilha sonora.

## Como rodar

```bash
cd estudio
npm install      # só na primeira vez
npm run dev      # abre a interface em http://localhost:5174
```

Para usar sem modo de desenvolvimento: `npm start` (compila e abre em http://localhost:5175).

### Instalação num computador novo (depois de clonar o repositório)

O repositório guarda só o código. Ficam de fora (ver `.gitignore`): `node_modules`, os projetos (`estudio/projetos/`), a chave de API (`estudio/.env`) e as vozes (modelos grandes). Para ter tudo de novo:

1. `npm install` e `npx playwright-core install ffmpeg` (gravação do vídeo; usa o Microsoft Edge instalado).
2. **Piper** (Python 3.9+): `python -m venv vozes/venv`, depois `vozes/venv/Scripts/pip install piper-tts`. Baixe as vozes pt-BR (`.onnx` + `.onnx.json` de faber, cadu, jeff e edresson) do repositório `rhasspy/piper-voices` no Hugging Face (pasta `pt/pt_BR`) para `vozes/piper/`.
3. **Kokoro** (Python 3.12): `uv venv --python 3.12 vozes/venv-kokoro` e `uv pip install kokoro-onnx soundfile` nesse ambiente. Baixe `kokoro-v1.0.fp16.onnx` e `voices-v1.0.bin` das releases de `thewh1teagle/kokoro-onnx` no GitHub para `vozes/kokoro/`.
4. Opcional: copie `.env.exemplo` para `.env` e coloque a chave do Gemini.
5. Login do Claude Code (`claude auth login`) para a direção, as ilustrações e a trilha com o Claude.

## Fluxo

1. **Roteiro**: escreva ou cole o roteiro no formato abaixo. O painel da direita mostra como o estúdio entendeu cada cena e avisa sobre problemas. `Ctrl+S` salva.
2. **Plano de animação**: "Gerar plano a partir do roteiro" monta páginas, efeitos e músicas lendo os Esquemas. Revise cada passo, troque descrições, envie suas próprias artes e salve.
3. **Música e efeitos**: a trilha de cada cena (veja abaixo).
4. **Assistir**: toca o livro animado. Dá para começar de qualquer cena.

Na tela inicial, os projetos podem ficar em **grupos**: escolha o grupo ao criar ou use "Grupo…" em cada projeto (✎ renomeia o grupo; clique no nome para recolher).

Enquanto a IA (ou a narração/exportação) trabalha, uma faixa dourada aparece abaixo do topo, a aba envolvida ganha um ponto pulsante e as cenas em que a IA está mexendo ficam com a borda animada. Se você trocar de aba no meio, a tarefa continua e o resultado é aplicado quando você voltar.

## Música e efeitos

Aba **Música e efeitos**:

- **Trilha com Claude:** o Claude lê as cenas (imagens, falas, efeitos visuais) e decide quando a música entra, muda e para, e onde vão os efeitos sonoros. Pode ser o plano todo ou só uma cena ("✦ Som com Claude"), com um pedido opcional. Falas e imagens não mudam.
- **Linha do tempo de cada cena:** os passos de som ficam destacados e editáveis (tipo, faixa ou som, volume, entrada/saída, ↑↓ para mudar o momento); os demais passos aparecem em cinza só como referência, e "＋ som" insere um som logo depois de qualquer um deles. Passos marcados "som próprio" (virar página, clarão…) já tocam um som.
- **Biblioteca:** ▶ ouve as 7 músicas e os 17 efeitos (trovão, espada, porta, passos, sino, magia, sussurros… e ambientes que ficam tocando até parar: vento, chuva, fogueira, coração, suspense, relógio).
- **Sons gravados (CC0):** 59 gravações reais em `estudio/sons/` (espadas, porrada, gritos de medo, gritos de guerra, dor, monstros, tempestade, terror), domínio público, uso comercial livre. Valem para todos os projetos, aparecem em "Som gravado" e o Claude também as usa ao compor. Créditos e origem em `sons/CREDITOS.md`; para acrescentar, ponha MP3/WAV numa subpasta de `sons/` (a subpasta vira a categoria).
- **Seus sons:** "+ Enviar MP3/WAV" guarda o arquivo em `assets/` e ele passa a ser escolhível em "Meu arquivo de som" (repetir até parar, ou tratar como música). Confira a licença de sons baixados.
- **Mesa de som:** volume geral de música, efeitos e vozes (vale para Assistir e para o vídeo).

## Vozes e vídeo (Instagram)

Aba **Vozes e vídeo**:

1. **Vozes (Piper, gratuito e local):** escolha a voz do narrador e de cada personagem entre `faber`, `cadu`, `jeff` e `edresson` (pt-BR, licenças CC0 / CC BY 4.0) e a velocidade. "▶ Ouvir" toca a primeira fala com aquela voz.
2. **Gerar narração:** cada fala vira um arquivo em `projetos/<id>/audio/`. Só falas novas ou alteradas são geradas de novo. A aba **Assistir** passa a usar essas vozes.
3. **Exportar Reels (9:16):** o Microsoft Edge (sem janela) toca o plano **salvo** e grava imagem e som em tempo real; o ffmpeg monta um MP4 1080×1920 (H.264 + AAC) com a animação no centro, a cena desfocada como fundo e legendas grandes abaixo do quadro. Os vídeos ficam em `projetos/<id>/exportacoes/`.

Instalação (já feita neste PC): `vozes/venv` (Python com `piper-tts`), vozes em `vozes/piper/`, `npm install` (playwright-core e ffmpeg-static) e `npx playwright-core install ffmpeg` (gravador de tela do Playwright).

## Formatos de apresentação

Na aba **Plano**, o seletor **Formato** escolhe como a história aparece:

- **Livro animado**: o livro antigo com páginas que viram, rasgam e queimam.
- **Cinematográfico**: tela cheia 16:9. Cada **plano** é uma imagem com **movimento de câmera** (aproximar, afastar, panorâmicas, subir/descer, zoom rápido), entra por **corte, fusão, pelo preto, pelo branco ou deslize**, e as falas aparecem como **legendas** com o nome de quem fala (pensamentos em itálico). Há ainda **título** (cartela), **tremor**, **escurecer** e os efeitos (clarão, sangue na tela, fogo, brilhos).

Trocar de livro para cinema **converte** o plano atual: direção, falas, músicas e ilustrações são aproveitadas (cada página vira um plano; página dividida vira dois). As ilustrações de livro são verticais e aparecem cortadas no 16:9; redesenhe-as (Claude, Gemini ou manual) para ocuparem a tela inteira. O diretor automático e o Claude também dirigem direto em cinema.

## Formato do roteiro

```
Título - Capítulo N:
Ext. Ambiente

Cena 01:
Narrador V.O
"Texto narrado <Pausa> continua depois da pausa."
Esquema de Animação: Passa a página ilustrando ...
Esquema de Som: Música calma ...
```

O estúdio também lê roteiros no estilo cinema, sem Esquemas:

```
Cena 06:
Ext. Ilha Corvo -- Ano 2458 Ao amanhecer.
Lia está no barco no meio do mar.
Sons de água batendo no casco

Lia Moreau V.O - Pensamentos
"Pensamento entre aspas"

ORB (Drone) - Falas
-- Primeira linha da fala
-- Segunda linha (vira um respiro entre as duas)

Lembranças de Lia: Gritos, luzes apagando
Nota: contexto de produção, não é narrado
```

- Personagem: linha com `V.O` e/ou `- Falas` / `- Pensamentos`. Pensamentos aparecem em itálico; o nome de quem fala aparece na página.
- Linhas começando com `Ext.`/`Int.` = ambiente; com `Som`/`Sons` = som; `Lembranças de …:` = flashback; `Nota:` = contexto; o resto = ação (o que se vê).
- Na aba Assistir, "Vozes dos personagens" escolhe voz e tom de cada personagem.

- Takes: `Take - 1 <texto> End Take 1`
- Marcadores: `<Pausa>`, `<Pausa 1>`, `<Transição Musical>` (qualquer `<...>` com "transi")
- Esquema por take: `Take 1 - descrição - End Take 1.`

### Palavras que o diretor automático entende

| No esquema | Vira |
|---|---|
| calma, fantasia · guerra, luta, perigo · esperança, alívio · agonia, tensão · perseguição · calma e leve | trilhas `calma`, `guerra`, `esperanca`, `agonia`, `perseguicao`, `suave` |
| "após a pausa" (no som) | a música começa na primeira pausa |
| intensifica · acelerando · volume aumentando | ajustes de intensidade, andamento e volume |
| para bruscamente · fogo de fundo · silêncio · perfurando | corte seco, som de fogo, silêncio na transição, efeito de perfuração |
| superior / inferior / embaixo | página dividida em cima e embaixo |
| sangue · mais fortes · fogo · tons escuros · embaçado | manchas, borda queimada, página escura, desfoque |
| cria um efeito de sangue · fogo queima a página · cinzas · rasgando · livro fechando | respingo na página atual, queimar, surgir das cinzas, rasgar, fechar o livro |
| passando rapidamente · passar de páginas rápido · passada lenta | velocidade da virada de página |

O que o diretor não entender, você ajusta na aba Plano.

## Direção com Claude

Na aba **Plano de animação**, o painel "Direção com Claude" pede ao Claude para dirigir o roteiro inteiro, ou use "✦ Refazer com Claude" numa cena para refazer só ela, com um pedido opcional ("pausa mais longa antes do rasgo"). O resultado chega como alterações não salvas, com as cenas marcadas para revisão. Nada é salvo sem você clicar em "Salvar plano". As artes que você enviou são mantidas nas cenas refeitas.

O estúdio usa a CLI do Claude Code com a sua assinatura (sem chave de API). Precisa de login uma vez:

```bash
npm install -g @anthropic-ai/claude-code
claude auth login
```

O estúdio procura a CLI nesta ordem: variável `ESTUDIO_CLAUDE`, `claude` no PATH, cópia que vem com o app Claude para Windows. Para fixar um modelo, defina `ESTUDIO_MODELO` (ex.: `claude-opus-5-5`); sem ela, vale o padrão da sua conta.

O Claude recebe só o roteiro (roda sem ferramentas, numa pasta vazia). A resposta é validada: catálogo de passos, coerência do livro (abrir antes de virar, cinzas depois de queimar) e se toda a narração do roteiro foi incluída. Se algo falhar, o estúdio pede uma correção automaticamente uma vez; o que restar aparece como "pontos para conferir".

Para testar sem gastar o plano: `ESTUDIO_CLAUDE=tests/claude-simulado.ts npm run dev`.

## Ilustrações

1. Aba **Elenco e estilo**: "Montar elenco e estilo" pede ao Claude o estilo visual e a aparência fixa de cada personagem (a partir do roteiro e das descrições do plano). Revise e salve: isso entra em todos os pedidos de ilustração e mantém os personagens iguais entre as páginas.
2. Aba **Plano**: o painel "Ilustrações com Claude" desenha todas as que faltam, ou use "✦ Desenhar com Claude" em uma ilustração. Os desenhos chegam aos poucos no plano (não salvo) e também ficam guardados em `projetos/<id>/assets/ilustracoes/`.
3. Qualidade **detalhada** (~5 min por ilustração, esforço alto) ou **rápida** (~1 min, desenho mais simples). Duas ilustrações são desenhadas ao mesmo tempo. Defina `ESTUDIO_ESFORCO_ARTE=xhigh` para caprichar ainda mais.

As ilustrações são SVG (vetor) desenhadas pelo Claude: o player anima os traços como tinta. Todo SVG recebido é limpo antes de entrar na página (sem scripts, links externos ou eventos).

Alterações não salvas no plano viram um **rascunho** no servidor; ao reabrir o projeto, o estúdio oferece recuperar.

### Imagens com o Gemini (Nano Banana)

**Pela API (automático):**
1. Crie uma chave em https://aistudio.google.com (API key) com cobrança ativa (cerca de US$ 0,05 por imagem; é separado do Google One).
2. Copie `estudio/.env.exemplo` para `estudio/.env` e cole a chave em `ESTUDIO_GEMINI_CHAVE=`. Não precisa reiniciar.
3. Na aba **Elenco e estilo**, gere a **folha de referência** de cada personagem ("✦ Gerar folha com Gemini") ou cole uma arte sua. Salve o elenco.
4. Na aba **Plano**, escolha o motor **Gemini** no painel Ilustrações e gere as que faltam. Cada imagem leva as folhas dos personagens que aparecem nela (até 4), para manter a aparência.

**Com a sua assinatura (manual, sem custo extra):** em cada ilustração do Plano, "Copiar prompt", cole no app do Gemini (anexe lá as folhas dos personagens), baixe ou copie a imagem e **arraste ou cole (Ctrl+V)** na área da ilustração. O mesmo vale para as folhas de personagem na aba Elenco ("Copiar prompt da folha").

O modelo padrão é `gemini-nano-banana-2.1`; troque com `ESTUDIO_GEMINI_MODELO` no `.env`. Para testar sem custo: `npx tsx tests/gemini-simulado.ts` e rode o estúdio com `ESTUDIO_GEMINI_URL=http://127.0.0.1:5199/v1beta/interactions ESTUDIO_GEMINI_CHAVE=teste`.

## Onde ficam os arquivos

Cada projeto é uma pasta em `estudio/projetos/<id>/`: `roteiro.txt`, `plano.json`, `assets/` (suas artes) e `historico/` (versões anteriores do roteiro e do plano). Projetos excluídos vão para `projetos/_lixeira/`.

## Testes

```bash
npm test         # leitor do roteiro e diretor automático
npm run typecheck
```
