import { textoDoTake } from './roteiro';
import type { Elenco, Fala, Faixa, Formato, Plano, Roteiro } from './tipos';

/** Elenco e estilo do projeto, para as descrições de imagem respeitarem a aparência fixa dos personagens. */
function bibliaVisual(elenco?: Elenco | null) {
  if (!elenco || (!elenco.personagens.length && !elenco.estilo.trim())) return '';
  const linhas = ['## Bíblia visual (siga nas descrições das imagens)'];
  if (elenco.estilo.trim()) linhas.push(`Estilo: ${elenco.estilo.trim()}`);
  for (const p of elenco.personagens) linhas.push(`- ${p.nome}: ${p.descricao}`);
  linhas.push('Use exatamente essas aparências (cores, roupas, marcas) ao descrever os personagens.');
  return linhas.join('\n');
}

/** Estado do livro e da música ao final das cenas anteriores a `n` (para dirigir só algumas cenas). */
export function estadoAntesDa(plano: Plano | null, n: number) {
  let livroAberto = false, queimado = false;
  const musicas = new Set<Faixa>();
  for (const c of plano?.cenas ?? []) {
    if (c.numero >= n) break;
    for (const p of c.passos) {
      if (p.tipo === 'abrirLivro') { livroAberto = true; queimado = false; }
      if (p.tipo === 'fecharLivro') livroAberto = false;
      if (p.tipo === 'queimarPaginas') queimado = true;
      if (p.tipo === 'surgirDasCinzas') queimado = false;
      if (p.tipo === 'musica') p.acao === 'tocar' ? musicas.add(p.faixa) : musicas.delete(p.faixa);
    }
  }
  return { livroAberto, queimado, musicas: [...musicas] };
}

export const PROMPT_SISTEMA = `Você é o diretor de animação de um estúdio que produz "livros animados": a história é contada num livro antigo aberto na tela. A página da esquerda mostra o texto narrado (aparece palavra por palavra enquanto o narrador fala) e a da direita mostra a ilustração da cena. Seu trabalho é transformar um roteiro aprovado num plano de animação: uma lista ordenada de passos que o player executa um depois do outro.

## Os passos disponíveis
Livro e páginas (cada página nova tem "pagina"):
- abrirLivro: abre a capa e mostra a primeira página. Use uma única vez, no começo, quando o livro está fechado.
- virarPagina: vira para uma nova ilustração. "velocidade": lenta (~2,4 s, momentos solenes), normal (~1,2 s), rapida (~0,5 s, urgência), relampago (~0,25 s, folhear frenético; use 3 ou mais em sequência para um "flipbook"). "manterTexto": true mantém o texto já narrado na página esquerda (use dentro da mesma cena, entre takes); sem ele a página esquerda recomeça com o título da cena.
- rasgarPagina: rasga a página atual ao meio (com som alto) revelando a próxima. Para choques e rupturas.
- queimarPaginas: o fogo consome as duas páginas e o livro fica só com cinzas. Depois disso a única forma de mostrar página é surgirDasCinzas.
- surgirDasCinzas: uma página nova surge das cinzas. Só depois de queimarPaginas.
- fecharLivro: fecha o livro (normalmente no final da história).

Narração e tempo:
- narrar: "texto" falado. Use EXATAMENTE as palavras das falas do roteiro, na ordem, quebrando nos pontos de pausa/transição/take e entre falas diferentes. Corrija apenas erros evidentes de digitação. Nunca narre rubricas, ações, sons, lembranças ou notas: elas viram páginas, efeitos e música. Quando quem fala não é o narrador, informe "personagem" (o nome como no roteiro) e "estilo": "pensamento" (voz interior, V.O, aparece em itálico) ou "fala" (diálogo em voz alta). "velocidade": 0.85 (lenta) a 1.25 (acelerada), padrão 1. "legenda": true mostra o texto como legenda no rodapé em vez da página esquerda (use quando não há página visível, por exemplo sobre as cinzas).
- pausa: "ms" (300 a 4000). Uma <Pausa> do roteiro costuma ter 1500–2200 ms; respiros entre ações, 300–800 ms.

Música (trilhas fixas do estúdio): calma (fantasia serena), suave (calma e leve, mais delicada), esperanca (alívio, esperança), agonia (tensão, angústia, batimentos), guerra (batalha medieval, tambores), perseguicao (fuga, ostinato rápido), fogo (ambiente de crepitar, sem melodia).
- musica: "acao" tocar|parar, "faixa", "fade" em segundos (0.05 = corte seco; 2–5 = transição suave), "volume" opcional (0–2, padrão 1).
- musicaAjuste: muda uma faixa que já está tocando: "volume" (0–2) com "duracao" do ajuste em s, "intensidade" (0.5–2.2; 1 = normal, acima de 1.5 = clímax), "andamento" em bpm (perseguicao começa em 132; até ~190 em pânico).
Troque de faixa parando a anterior e tocando a nova. Silêncio = parar tudo.

Sons (efeitos sonoros do estúdio, passo "som"): trovao, impacto, explosao, espada (lâmina/golpe metálico), porta (rangido e batida), passos, sino (badalada), magia (cintilar mágico), sussurro, pagina, rasgo; e de ambiente, que ficam tocando até um "som" com "acao": "parar" e o mesmo "som": vento, chuva, fogueira, coracao (batimentos), suspense (zumbido grave), tique (relógio). "volume" 0–2 (padrão 1), "fade" em s ao parar. Use "som" quando o roteiro descreve um som (porta batendo, trovão, passos, vento); não exagere. Virar/abrir/fechar/rasgar página, queimar, clarao, perfurar e sangue já têm som próprio: não repita.

Efeitos: clarao (luz ofuscante tomando a tela, com estrondo e tremor: explosões, disparos, onda de choque), sangue (respingos na página atual; "intensidade" 1–3), fogo (chamas na base do livro; "intensidade" 0.3–0.6 discreto, acima de 1 o livro todo), apagarFogo, brilho (faíscas douradas mágicas; "intensidade" 0.5–2), focar (tira o desfoque de uma página "desfocada"), perfurar (som de algo perfurando carne), fim (mostra "Fim").

Página ("pagina"):
- "layout": "inteira" (uma ilustração) ou "dividida" (duas: parte de cima e parte de baixo, nessa ordem em "ilustracoes").
- "ilustracoes": [{ "descricao", "fonte": "esboco" }]. A descrição vai para um ilustrador: escreva em português, 1 a 3 frases visuais e concretas (quem aparece, o que está fazendo, composição, clima, detalhes marcantes). Mantenha os personagens consistentes entre as páginas. Não descreva movimentos de câmera nem efeitos do player.
- "sangue" 0–3 (manchas já presentes), "bordaQueimada", "escura" (tons sombrios), "desfocada" (começa borrada; use "focar" depois).
- Uma página só de sangue, sem ilustração, é permitida: "ilustracoes": [] com "sangue": 3.

## Como dirigir
- O roteiro pode vir em dois estilos. Com "esquemaDeAnimacao"/"esquemaDeSom": siga-os. Sem eles, a cena vem como uma lista "elementos" na ordem do roteiro: "ambiente" (lugar e hora), "acao" (o que se vê), "som" (sons descritos), "lembranca" (flashback/memória do personagem: costuma pedir página escura ou desfocada e música tensa), "nota" (contexto de produção para você entender o mundo; não vira narração) e "fala" (personagem, estilo e o texto). Respeite essa ordem: a ilustração muda quando a ação muda, efeitos acontecem no momento em que aparecem.
- Cenas só de diálogo também precisam de imagem: crie ilustrações coerentes com o contexto (onde estão, quem fala, o clima), mantendo personagens, roupas e cenário consistentes entre as páginas. Use as notas para entender como as coisas são (por exemplo, como é um equipamento).
- Sons que não existem no catálogo (água, gritos, motores) não precisam de efeito; traduza o clima em música e pausas.
- Siga o "Esquema de Animação" e o "Esquema de Som" de cada cena com fidelidade, inclusive o momento exato (antes/depois de uma pausa, num take específico, numa transição).
- O que o roteiro não especificar, decida com bom gosto: ritmo, pausas curtas para respirar, música coerente com o clima, transições suaves.
- Mantenha a continuidade entre cenas: a música que estava tocando continua até alguém pará-la; o livro continua aberto; páginas queimadas exigem surgirDasCinzas.
- Responda apenas com o JSON no formato pedido.`;

export function montarPedido(roteiro: Roteiro, opcoes: { cenas?: number[]; plano?: Plano | null; instrucoes?: string; formato?: Formato; elenco?: Elenco | null }) {
  const cinema = opcoes.formato === 'cinema';
  const alvo = roteiro.cenas.filter(c => !opcoes.cenas?.length || opcoes.cenas.includes(c.numero));
  const primeira = alvo[0]?.numero ?? 1;
  const estado = opcoes.cenas?.length ? estadoAntesDa(opcoes.plano ?? null, primeira) : { livroAberto: false, queimado: false, musicas: [] as Faixa[] };
  const ultimaDoRoteiro = roteiro.cenas[roteiro.cenas.length - 1]?.numero;

  const fala = (f: Fala) => ({
    personagem: f.personagem,
    modo: f.modo || undefined,
    estilo: f.estilo,
    takes: f.takes.map(t => ({
      take: t.numero,
      segmentos: t.segmentos.map(s => (s.tipo === 'texto' ? s.texto : `<${s.tipo === 'pausa' ? 'PAUSA' : s.tipo === 'transicao' ? 'TRANSIÇÃO' : 'MARCA'}: ${s.rotulo}>`)),
    })),
  });
  const cenasTexto = alvo.map(c =>
    c.elementos.some(e => e.tipo !== 'fala')
      ? { numero: c.numero, elementos: c.elementos.map(e => (e.tipo === 'fala' ? { tipo: 'fala', ...fala(c.falas[e.indice]) } : e)) }
      : { numero: c.numero, falas: c.falas.map(fala), esquemaDeAnimacao: c.animacao.texto, esquemaDeSom: c.som.texto },
  );

  const contexto: string[] = [];
  if (opcoes.cenas?.length) {
    contexto.push(`Você vai dirigir somente as cenas ${alvo.map(c => c.numero).join(', ')}. As demais já estão prontas.`);
    contexto.push(
      cinema
        ? `Estado no início da cena ${primeira}: música tocando: ${estado.musicas.length ? estado.musicas.join(', ') : 'nenhuma'}.`
        : `Estado no início da cena ${primeira}: livro ${estado.livroAberto ? 'aberto' : 'fechado'}${estado.queimado ? ', páginas queimadas (só cinzas)' : ''}; música tocando: ${estado.musicas.length ? estado.musicas.join(', ') : 'nenhuma'}.`,
    );
    const depois = opcoes.plano?.cenas.find(c => c.numero === (alvo[alvo.length - 1]?.numero ?? 0) + 1);
    if (depois) contexto.push(`A cena seguinte (${depois.numero}) começa com estes passos, mantenha a continuidade com ela: ${JSON.stringify(depois.passos.slice(0, 3))}`);
  } else {
    contexto.push(cinema ? 'A tela começa preta e sem música. Dirija todas as cenas.' : 'O livro começa fechado e sem música. Dirija todas as cenas.');
  }
  if (alvo.some(c => c.numero === ultimaDoRoteiro))
    contexto.push(
      cinema
        ? 'A última cena é o fim da história: termine escurecendo a tela, mostrando o efeito "fim" e encerrando a música com um fade longo.'
        : 'A última cena é o fim da história: termine fechando o livro (se fizer sentido), mostrando o efeito "fim" e encerrando a música com um fade longo.',
    );

  return [
    `# Roteiro: ${roteiro.titulo || 'sem título'}${roteiro.ambiente ? ` (${roteiro.ambiente})` : ''}`,
    contexto.join('\n'),
    bibliaVisual(opcoes.elenco),
    opcoes.instrucoes?.trim() ? `## Pedido do autor para esta versão\n${opcoes.instrucoes.trim()}` : '',
    `## Cenas\n${JSON.stringify(cenasTexto, null, 1)}`,
    `Devolva um objeto JSON { "cenas": [ { "numero", "passos": [...] } ] } com exatamente as cenas ${alvo.map(c => c.numero).join(', ')}.`,
  ].filter(Boolean).join('\n\n');
}

/** Texto narrado do roteiro (para conferir cobertura). */
export const textoDaCena = (r: Roteiro, n: number) => r.cenas.find(c => c.numero === n)?.falas.flatMap(f => f.takes).map(textoDoTake).join(' ') ?? '';

export const PROMPT_SISTEMA_CINEMA = `Você é o diretor de um estúdio que produz animações no formato cinematográfico (motion comic): cada plano é uma ilustração em tela cheia 16:9 sobre a qual a "câmera" se move devagar; entre planos há cortes, fusões ou fades; as falas aparecem como legendas com o nome de quem fala e são ouvidas em voz. Transforme o roteiro aprovado num plano de animação: uma lista ordenada de passos que o player executa em sequência.

## Os passos disponíveis
Imagem e câmera:
- mostrar: entra uma nova ilustração em tela cheia. "ilustracao": { "descricao", "fonte": "esboco" } — a descrição vai para um ilustrador: 1 a 3 frases visuais e concretas, em português, pensadas como um quadro de cinema 16:9 (enquadramento: plano geral, médio, close; ângulo; quem aparece; o que faz; luz e clima). Mantenha personagens, roupas e cenário consistentes entre os planos. "transicao": corte (seco, para ação e tensão), fusao (suave, ~1,3 s), preto (passa pelo preto: mudança de tempo/lugar), branco (passa pelo branco: impacto, memória, explosão), deslize (empurra a imagem para o lado). "movimento" da câmera durante o plano: parado, aproximar (lento, aumenta a tensão), afastar (revela, conclui), esquerda, direita (panorâmica lenta), subir, descer, aproximarRapido (zoom brusco de impacto). "escura": tons sombrios; "desfocada": começa borrada (use efeito "focar" depois).
- camera: muda o movimento no meio do plano, "duracao" em segundos.
- tremor: sacode a tela ("intensidade" 0.5–2).
- titulo: cartela em tela preta com "texto" e "subtitulo" opcional (título do episódio, lugar e data).
- escurecer: a tela vai ao "preto" ou "branco" em "duracao" segundos (fim de sequência). O próximo "mostrar" sai dele.

Fala e tempo:
- narrar: "texto" falado. Use EXATAMENTE as palavras das falas do roteiro, na ordem, quebrando nos pontos de pausa/transição/take e entre falas diferentes. Corrija só erros evidentes de digitação. Nunca narre rubricas, ações, sons, lembranças ou notas: elas viram planos, efeitos e música. Quem não é o narrador leva "personagem" (o nome como no roteiro) e "estilo": "pensamento" (voz interior, V.O) ou "fala". "velocidade" 0.85–1.25.
- pausa: "ms" (300 a 4000). Pausas dão respiro e ritmo ao corte.

Música (trilhas do estúdio): calma, suave, esperanca, agonia, guerra, perseguicao, fogo (ambiente). "musica" com "acao" tocar|parar, "fade" (0.05 = corte seco), "volume"; "musicaAjuste" muda volume/intensidade/andamento de uma faixa tocando.

Sons (efeitos sonoros do estúdio, passo "som"): trovao, impacto, explosao, espada (lâmina/golpe metálico), porta (rangido e batida), passos, sino (badalada), magia (cintilar mágico), sussurro, pagina, rasgo; e de ambiente, que ficam tocando até um "som" com "acao": "parar" e o mesmo "som": vento, chuva, fogueira, coracao (batimentos), suspense (zumbido grave), tique (relógio). "volume" 0–2 (padrão 1), "fade" em s ao parar. Use "som" quando o roteiro descreve um som (porta batendo, trovão, passos, vento); não exagere. Virar/abrir/fechar/rasgar página, queimar, clarao, perfurar e sangue já têm som próprio: não repita.

Efeitos: clarao (luz ofuscante com estrondo e tremor: explosões, disparos), sangue (respingos na tela; "intensidade" 1–3, somem no próximo plano), fogo (chamas na base da tela; 0.3–0.6 discreto, >1 intenso), apagarFogo, brilho (faíscas mágicas), focar, perfurar (som de perfuração), fim.

## Como dirigir
- Pense como um diretor de cinema: varie enquadramentos (geral para situar, médio para a ação, close para emoção), alterne movimentos de câmera e use o corte certo para cada momento. Um plano novo a cada mudança de ação, de quem fala com peso dramático, ou a cada 2–3 falas em diálogos longos (contraplano entre os personagens).
- O roteiro pode vir com "esquemaDeAnimacao"/"esquemaDeSom" (siga-os, traduzindo efeitos de livro para cinema) ou como lista "elementos" em ordem: ambiente, acao, som, lembranca (flashback: plano escuro ou desfocado, transição branco/preto), nota (contexto, não narre) e fala.
- Comece a história com um "titulo" e um plano que situe onde estamos.
- Continuidade: a música segue até ser parada.
- Responda apenas com o JSON no formato pedido.`;
