import type { CenaPlano, Faixa, Passo, Plano, Som } from './tipos';
import { esquemaPasso, FAIXAS, passoSom, validarPasso } from './validar';

/** Trilha sonora: o que é música/som num plano, catálogo para a interface e a sonoplastia com o Claude. */

/** Som gravado da biblioteca do estúdio (estudio/sons) ou enviado ao projeto. */
export interface SomGravado { src: string; nome: string; categoria?: string; bytes?: number }

export const ehPassoDeSom = (p: Passo) => p.tipo === 'musica' || p.tipo === 'musicaAjuste' || p.tipo === 'som';

export const NOMES_FAIXAS: [Faixa, string][] = [
  ['calma', 'Calma / fantasia'], ['suave', 'Suave'], ['esperanca', 'Esperança'], ['agonia', 'Agonia'],
  ['guerra', 'Guerra'], ['perseguicao', 'Perseguição'], ['fogo', 'Fogo (ambiente)'],
];

export const CATALOGO_SONS: { som: Som; nome: string; ambiente?: boolean }[] = [
  { som: 'trovao', nome: 'Trovão' }, { som: 'impacto', nome: 'Impacto' }, { som: 'explosao', nome: 'Explosão' },
  { som: 'espada', nome: 'Espada' }, { som: 'porta', nome: 'Porta rangendo' }, { som: 'passos', nome: 'Passos' },
  { som: 'sino', nome: 'Sino' }, { som: 'magia', nome: 'Magia' }, { som: 'sussurro', nome: 'Sussurros' },
  { som: 'pagina', nome: 'Página' }, { som: 'rasgo', nome: 'Rasgo' },
  { som: 'vento', nome: 'Vento', ambiente: true }, { som: 'chuva', nome: 'Chuva', ambiente: true },
  { som: 'fogueira', nome: 'Fogueira', ambiente: true }, { som: 'coracao', nome: 'Coração batendo', ambiente: true },
  { som: 'suspense', nome: 'Zumbido de suspense', ambiente: true }, { som: 'tique', nome: 'Relógio', ambiente: true },
];
export const nomeDoSom = (s?: Som) => CATALOGO_SONS.find(x => x.som === s)?.nome ?? s ?? '';

/** Faixas de música tocando no início da cena n. */
export function musicasAntesDa(plano: Plano, n: number): Faixa[] {
  const tocando = new Set<Faixa>();
  for (const c of plano.cenas) {
    if (c.numero >= n) break;
    for (const p of c.passos) if (p.tipo === 'musica') p.acao === 'tocar' ? tocando.add(p.faixa) : tocando.delete(p.faixa);
  }
  return [...tocando];
}

const curto = (t: string, n = 140) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** Uma linha legível de um passo que não é de som (para o Claude saber o que acontece na tela). */
export function descreverPasso(p: Passo): string {
  switch (p.tipo) {
    case 'narrar': return `${p.personagem ? `${p.personagem} (${p.estilo ?? 'fala'})` : 'Narrador'}: "${curto(p.texto)}"`;
    case 'pausa': return `pausa de ${p.ms} ms`;
    case 'mostrar': return `nova imagem: ${curto(p.ilustracao.descricao)}${p.escura ? ' (escura)' : ''}`;
    case 'abrirLivro': case 'virarPagina': case 'rasgarPagina': case 'surgirDasCinzas':
      return `${p.tipo}: ${curto(p.pagina.ilustracoes.map(i => i.descricao).join(' / '))}`;
    case 'efeito': return `efeito visual ${p.efeito}${p.intensidade ? ` (${p.intensidade})` : ''}`;
    case 'titulo': return `título "${p.texto}"`;
    default: return p.tipo;
  }
}

/** Passos visuais que já tocam um som do estúdio. */
export const temSomProprio = (p: Passo) =>
  ['abrirLivro', 'virarPagina', 'fecharLivro', 'rasgarPagina', 'queimarPaginas'].includes(p.tipo) ||
  (p.tipo === 'efeito' && ['clarao', 'perfurar', 'sangue'].includes(p.efeito));

export const PROMPT_SONOPLASTA = `Você é o sonoplasta e compositor de um estúdio de animação. Recebe cenas já dirigidas (imagens, falas, efeitos visuais) e decide a trilha sonora: quando cada música entra, muda ou para, e quais efeitos sonoros tocam e onde.

Cada cena vem com os passos visuais/falados numerados [0], [1], [2]… Sua resposta reescreve a lista de passos da cena: os passos existentes entram como {"tipo":"ref","i":N}, TODOS, uma vez cada, na mesma ordem; entre eles você coloca os passos de som. Não invente nem remova passos visuais ou falas. Os passos de som que já existiam (marcados como "som atual") podem ser mantidos, mudados ou removidos: a sua lista substitui todos eles.

Passos de som:
- musica: "acao" tocar|parar, "faixa", "fade" em segundos (0.05 = corte seco; 2–5 = suave), "volume" (0–2, padrão 1). Trilhas: calma (fantasia serena), suave (delicada), esperanca (alívio), agonia (tensão, angústia), guerra (batalha, tambores), perseguicao (fuga, ritmo rápido), fogo (ambiente de crepitar). Troque de faixa parando a anterior. A música continua de uma cena para a outra até ser parada.
- musicaAjuste: muda uma faixa tocando: "volume" (0–2) com "duracao" em s, "intensidade" (0.5–2.2; 1 normal, >1.5 clímax), "andamento" em bpm.
- som: efeito sonoro. Uma vez: trovao, impacto, explosao, espada, porta (rangido + batida), passos, sino, magia, sussurro, pagina, rasgo. Ambiente (fica tocando até {"tipo":"som","som":X,"acao":"parar"}): vento, chuva, fogueira, coracao, suspense, tique. "volume" 0–2, "fade" ao parar.

Alguns passos já fazem som sozinhos; NÃO coloque som repetido junto deles: abrirLivro, virarPagina e fecharLivro (folha/capa), rasgarPagina (rasgo), queimarPaginas (sopro de fogo), efeito clarao (explosão), efeito perfurar, efeito sangue (respingo). Eles vêm marcados com "(já tem som)".

Sons gravados (quando a lista vier no pedido): {"tipo":"som","src":"<um dos endereços da lista>","volume":…}. São gravações reais (gritos, espadas, socos, trovão…) e soam melhor que os sintetizados para vozes e lutas. Varie entre os números de uma mesma categoria (grito-guerra-1, -2…). Os longos (trovão longo, chuva, trompas, terror) podem levar "loop": true e depois {"tipo":"som","src":…,"acao":"parar"}.

Boas práticas: música dá a emoção da cena, não a ilustra palavra por palavra; abaixe o volume da música (musicaAjuste ~0.5) em diálogos importantes e suba no clímax; silêncio também é recurso; efeitos sonoros pontuais no momento exato da ação (logo antes ou depois do passo correspondente); pare os sons de ambiente quando o lugar muda. Responda apenas com o JSON no formato pedido.`;

export function pedidoSonoplastia(plano: Plano, cenas: number[], instrucoes?: string, biblioteca: SomGravado[] = []) {
  const alvo = plano.cenas.filter(c => !cenas.length || cenas.includes(c.numero));
  const linhas: string[] = [`# ${plano.titulo}`, `Formato: ${plano.formato === 'cinema' ? 'cinematográfico' : 'livro animado'}.`];
  if (alvo.length) {
    const antes = musicasAntesDa(plano, alvo[0].numero);
    linhas.push(antes.length ? `Música tocando quando a cena ${alvo[0].numero} começa: ${antes.join(', ')}.` : 'Nenhuma música toca antes da primeira cena pedida.');
  }
  if (instrucoes?.trim()) linhas.push(`\nPedido do usuário: ${instrucoes.trim()}`);
  if (biblioteca.length) {
    linhas.push('\n## Sons gravados disponíveis ("src")');
    const cats = [...new Set(biblioteca.map(b => b.categoria ?? 'outros'))];
    for (const c of cats) linhas.push(`${c}: ${biblioteca.filter(b => (b.categoria ?? 'outros') === c).map(b => b.src).join(' ')}`);
  }
  for (const c of alvo) {
    linhas.push(`\n## Cena ${c.numero}`);
    let i = 0;
    for (const p of c.passos) {
      if (ehPassoDeSom(p)) linhas.push(`   (som atual: ${JSON.stringify(p)})`);
      else linhas.push(`[${i++}] ${descreverPasso(p)}${temSomProprio(p) ? ' (já tem som)' : ''}`);
    }
  }
  linhas.push(`\nDevolva as cenas ${alvo.map(c => c.numero).join(', ')}.`);
  return linhas.join('\n');
}

export function schemaSonoplastia(biblioteca: SomGravado[] = []) {
  return {
    type: 'object',
    properties: {
      cenas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            numero: { type: 'integer' },
            passos: {
              type: 'array',
              items: {
                anyOf: [
                  esquemaPasso('ref', { i: { type: 'integer' } }, ['i']),
                  esquemaPasso('musica', { faixa: { enum: FAIXAS }, acao: { enum: ['tocar', 'parar'] }, fade: { type: 'number' }, volume: { type: 'number' } }, ['faixa', 'acao']),
                  esquemaPasso('musicaAjuste', { faixa: { enum: FAIXAS }, volume: { type: 'number' }, intensidade: { type: 'number' }, andamento: { type: 'integer' }, duracao: { type: 'number' } }, ['faixa']),
                  passoSom,
                  ...(biblioteca.length
                    ? [esquemaPasso('som', { src: { enum: biblioteca.map(b => b.src) }, acao: { enum: ['tocar', 'parar'] }, volume: { type: 'number' }, loop: { type: 'boolean' }, fade: { type: 'number' } }, ['src'])]
                    : []),
                ],
              },
            },
          },
          required: ['numero', 'passos'],
          additionalProperties: false,
        },
      },
    },
    required: ['cenas'],
    additionalProperties: false,
  };
}

/**
 * Aplica a trilha nova (montada sobre uma cópia antiga da cena) à cena como ela está agora:
 * os passos visuais/falados vêm da cena atual (com as edições feitas enquanto o Claude compunha),
 * só os sons vêm da trilha nova. Se os passos visuais mudaram de quantidade, não dá para encaixar: devolve null.
 */
export function aplicarSomNaCena(atual: CenaPlano, nova: CenaPlano): CenaPlano | null {
  const base = atual.passos.filter(p => !ehPassoDeSom(p));
  if (nova.passos.filter(p => !ehPassoDeSom(p)).length !== base.length) return null;
  let k = 0;
  return { ...atual, passos: nova.passos.map(p => (ehPassoDeSom(p) ? p : base[k++])) };
}

/**
 * Junta a trilha devolvida pelo Claude com a cena: os passos visuais/falados ficam todos, na ordem original;
 * os passos de som antigos são trocados pelos novos. Referências faltando são reinseridas no lugar.
 */
export function mesclarSom(cena: CenaPlano, resposta: unknown[], avisos: string[] = []): CenaPlano {
  const base = cena.passos.filter(p => !ehPassoDeSom(p));
  const passos: Passo[] = [];
  let prox = 0, faltaram = 0;
  resposta.forEach((r: any, k) => {
    if (r?.tipo === 'ref') {
      const i = Number(r.i);
      if (!Number.isInteger(i) || i < prox || i >= base.length) return;
      faltaram += i - prox;
      while (prox <= i) passos.push(base[prox++]);
      return;
    }
    if (r?.tipo !== 'musica' && r?.tipo !== 'musicaAjuste' && r?.tipo !== 'som') return;
    const v = validarPasso(r, `Cena ${cena.numero}, som ${k + 1}`, avisos);
    if (v) passos.push(v);
  });
  faltaram += base.length - prox;
  while (prox < base.length) passos.push(base[prox++]);
  if (faltaram) avisos.push(`Cena ${cena.numero}: ${faltaram} passo(s) não vieram na resposta e foram mantidos no lugar.`);
  return { ...cena, passos };
}
