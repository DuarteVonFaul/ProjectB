import { personagensPresentes, type LayoutIlustracao } from './promptIlustrador';
import type { Elenco, Personagem } from './tipos';

/**
 * Prompts para geradores de imagem (Gemini/Nano Banana pela API, ou colados à mão no app do Gemini).
 * O estilo vem livre do elenco do projeto.
 */

export type Proporcao = '3:4' | '3:2' | '16:9' | '1:1';
export const proporcaoDoLayout = (layout: LayoutIlustracao): Proporcao => (layout === 'cinema' ? '16:9' : layout === 'dividida' ? '3:2' : '3:4');

export interface PedidoImagem {
  descricao: string;
  layout: LayoutIlustracao;
  escura?: boolean;
  contexto?: string;
  instrucoes?: string;
}

export function montarPromptImagem(p: PedidoImagem, elenco: Elenco | null) {
  const presentes = personagensPresentes(p.descricao, elenco);
  const comRef = presentes.filter(pp => pp.referencia).slice(0, 4);
  const proporcao = proporcaoDoLayout(p.layout);
  const partes = [
    proporcao === '16:9'
      ? 'Quadro de animação cinematográfica, formato horizontal 16:9, com composição de cinema.'
      : `Ilustração para uma página de livro ilustrado. Formato ${proporcao === '3:4' ? 'vertical (retrato) 3:4' : 'horizontal (paisagem) 3:2'}.`,
    `Estilo: ${elenco?.estilo?.trim() || 'ilustração de livro, traço expressivo e cores harmoniosas'}`,
    `Cena: ${p.descricao.trim()}`,
    presentes.length
      ? `Personagens (mantenha exatamente esta aparência${comRef.length ? '; as imagens anexadas são as referências deles' : ''}):\n${presentes.map(pp => `- ${pp.nome}: ${pp.descricao}`).join('\n')}`
      : '',
    p.escura ? 'Clima sombrio, pouca luz, contraste forte.' : '',
    p.contexto ? `Contexto do momento (não escreva isso na imagem): ${p.contexto}` : '',
    p.instrucoes?.trim() ? `Ajustes pedidos: ${p.instrucoes.trim()}` : '',
    'Sem texto, letras, legendas, balões ou marcas d\'água na imagem. Composição cinematográfica com um ponto focal claro.',
  ];
  return { texto: partes.filter(Boolean).join('\n\n'), proporcao, referencias: comRef };
}

/** Folha de referência de um personagem (vista de corpo inteiro, fundo neutro). */
export function montarPromptFolha(p: Personagem, estilo: string) {
  return [
    `Folha de referência de personagem para manter a aparência consistente em várias ilustrações.`,
    `Estilo: ${estilo.trim() || 'ilustração de livro, traço expressivo'}`,
    `Personagem: ${p.nome}. ${p.descricao}`,
    'Mostre o personagem de corpo inteiro, de frente, em pose neutra, sobre fundo liso claro, e ao lado um close do rosto (ou do detalhe mais marcante, se não tiver rosto). Iluminação uniforme. Sem texto, letras ou legendas.',
  ].join('\n\n');
}
