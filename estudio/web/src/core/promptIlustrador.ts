import { textoDoTake } from './roteiro';
import { ESTILO_PADRAO, type Elenco, type Plano, type Roteiro } from './tipos';

// ===================== Elenco =====================

export const PROMPT_ELENCO = `Você é o diretor de arte de um estúdio de livros animados. A partir do roteiro e das descrições de página já planejadas, defina a bíblia visual da história para que todas as ilustrações fiquem consistentes:
- "estilo": 2 a 4 frases sobre como as ilustrações devem parecer (técnica, traço, paleta de cores, clima), adequado ao gênero da história. As ilustrações serão desenhadas em SVG vetorial sobre uma página de papel antigo, então prefira traço de tinta, hachuras e poucas cores chapadas ou aguadas; evite fotorrealismo.
- "personagens": cada personagem ou criatura/máquina recorrente que aparece nas imagens, com "nome" (como no roteiro) e "descricao": aparência fixa e concreta (idade aparente, corpo, rosto, cabelo, roupa, cores, acessórios e marcas inconfundíveis). Reaproveite e unifique o que as descrições de página já dizem; quando faltar, decida com bom gosto e coerência com a história.
Responda só com o JSON pedido.`;

export const schemaElenco = () => ({
  type: 'object',
  properties: {
    estilo: { type: 'string' },
    personagens: {
      type: 'array',
      items: { type: 'object', properties: { nome: { type: 'string' }, descricao: { type: 'string' } }, required: ['nome', 'descricao'], additionalProperties: false },
    },
  },
  required: ['estilo', 'personagens'],
  additionalProperties: false,
});

export function montarPedidoElenco(roteiro: Roteiro, plano: Plano | null) {
  const falas = roteiro.cenas.map(c => ({
    cena: c.numero,
    falas: c.falas.map(f => `${f.personagem}: ${f.takes.map(textoDoTake).join(' ')}`),
    descricao: c.animacao.texto,
    notas: c.elementos.filter(e => e.tipo === 'nota').map(e => (e as { texto: string }).texto),
  }));
  const paginas = (plano?.cenas ?? []).flatMap(c =>
    c.passos.flatMap(p => ('pagina' in p ? p.pagina.ilustracoes.map(i => `Cena ${c.numero}: ${i.descricao}`) : [])),
  );
  return [
    `# ${roteiro.titulo || 'História'}${roteiro.ambiente ? ` — ${roteiro.ambiente}` : ''}`,
    `## Roteiro (resumo por cena)\n${JSON.stringify(falas, null, 1)}`,
    paginas.length ? `## Descrições de página já planejadas\n${paginas.filter(Boolean).join('\n')}` : '',
    'Devolva { "estilo", "personagens": [ { "nome", "descricao" } ] }.',
  ].filter(Boolean).join('\n\n');
}

// ===================== Ilustração SVG =====================

export const PROMPT_ILUSTRADOR = `Você é ilustrador de um estúdio de livros animados e desenha em SVG à mão (código). Cada ilustração aparece numa página de papel antigo cor de pergaminho, e o player anima os traços como se a tinta estivesse sendo desenhada.

Regras técnicas do SVG:
- Um único elemento <svg> com xmlns e o viewBox exato pedido. Não use width/height.
- Use só formas vetoriais: path, circle, ellipse, rect, line, polyline, polygon, g, defs, linearGradient, radialGradient, clipPath, mask, pattern, filter simples. Proibido: <text>, <image>, <script>, <foreignObject>, links e fontes externas.
- O papel é o fundo: não pinte um retângulo cobrindo tudo. Se precisar de céu, mar ou escuridão, use áreas com fill-opacity entre 0.15 e 0.6.
- Contorne as formas importantes com stroke escuro (tinta, ex.: #2b1a10 ou a cor do estilo) com stroke-width 1 a 3 e stroke-linecap="round": são os traços que ganham a animação de tinta. Use hachuras (várias linhas finas paralelas) para sombras.
- Isto é ilustração de livro, não ícone nem cartum: capriche no desenho. Mínimo de 150 elementos (o ideal é 200 a 400), com a maior parte em traços de contorno e hachura, não em formas chapadas. Contornos com variação (linhas principais mais grossas, detalhes mais finos), texturas (ondas, rochas, metal, tecido) feitas com traços, e sombras feitas com grupos de hachuras paralelas ou cruzadas.
- Figuras humanas com proporção correta e anatomia crível (cabeça ~1/7 da altura), pose expressiva, rosto com traços (olhos, sobrancelhas, nariz, boca) quando estiver próximo, cabelo em mechas, roupa com dobras e costuras, mãos simplificadas mas com dedos. Personagem principal grande o bastante para ser reconhecido.
- Composição cinematográfica com primeiro plano, plano médio e fundo, e um ponto focal claro.
- Personagens devem seguir exatamente a bíblia visual (aparência fixa).
- Nada de texto, letreiros ou números escritos na imagem.
Responda apenas com o JSON pedido.`;

export const schemaIlustracao = () => ({
  type: 'object',
  properties: { svg: { type: 'string' } },
  required: ['svg'],
  additionalProperties: false,
});

export interface PedidoIlustracao {
  descricao: string;
  largura: number;
  altura: number;
  escura?: boolean;
  cinema?: boolean;
  instrucoes?: string;
  contexto?: string; // o que é narrado/falado nesta página
}

/** Personagens do elenco citados numa descrição (pelo nome completo ou por uma das palavras do nome). */
export function personagensPresentes(descricao: string, elenco: Elenco | null) {
  const desc = descricao.toLowerCase();
  return (elenco?.personagens ?? []).filter(pp => {
    const nomes = [pp.nome, ...pp.nome.split(/[\s()]+/)].map(n => n.toLowerCase()).filter(n => n.length >= 3);
    return nomes.some(n => desc.includes(n));
  });
}

export function montarPedidoIlustracao(p: PedidoIlustracao, elenco: Elenco | null) {
  const presentes = personagensPresentes(p.descricao, elenco);
  return [
    `## Estilo\n${elenco?.estilo?.trim() || ESTILO_PADRAO}`,
    presentes.length ? `## Personagens nesta imagem (aparência fixa)\n${presentes.map(pp => `- ${pp.nome}: ${pp.descricao}`).join('\n')}` : '',
    `## O que desenhar\n${p.descricao}`,
    p.contexto ? `## O que está sendo dito nesta página (só para clima; não escreva texto)\n${p.contexto}` : '',
    p.escura ? 'A página tem tons escuros: use mais áreas sombreadas, hachuras densas e contraste.' : '',
    p.instrucoes?.trim() ? `## Pedido do autor\n${p.instrucoes.trim()}` : '',
    p.cinema ? 'É um quadro de animação cinematográfica em tela cheia (não uma página de livro): pode pintar o fundo inteiro, com céu, cenário e luz, como um frame de cinema.' : '',
    `Formato: viewBox="0 0 ${p.largura} ${p.altura}" (${p.largura > p.altura ? 'paisagem' : 'retrato'}). Devolva { "svg": "<svg ...>...</svg>" }.`,
  ].filter(Boolean).join('\n\n');
}

/** Tamanho do espaço da ilustração na página (deve bater com paginas.ts). */
export type LayoutIlustracao = 'inteira' | 'dividida' | 'cinema';
export const tamanhoSlot = (layout: LayoutIlustracao) =>
  layout === 'cinema' ? { largura: 640, altura: 360 } : layout === 'dividida' ? { largura: 388, altura: 262 } : { largura: 388, altura: 544 };
