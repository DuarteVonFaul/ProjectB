import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  montarPedidoElenco,
  montarPedidoIlustracao,
  PROMPT_ELENCO,
  PROMPT_ILUSTRADOR,
  schemaElenco,
  schemaIlustracao,
  tamanhoSlot,
  type LayoutIlustracao,
} from '../web/src/core/promptIlustrador';
import { lerRoteiro } from '../web/src/core/roteiro';
import { limparSvg, SvgInvalido } from '../web/src/core/svg';
import type { Elenco, Plano } from '../web/src/core/tipos';
import { ErroClaude, perguntarClaude } from './claude';
import { ErroGemini, extensaoDe, gerarImagem } from './gemini';
import { montarPromptImagem } from '../web/src/core/promptImagem';

/** Tarefas de arte: montar o elenco (bíblia visual) e desenhar ilustrações SVG. */

export interface ItemIlustracao {
  chave: string; // identifica a ilustração no plano: "c<cena>-p<página>-s<slot>"
  descricao: string;
  layout: LayoutIlustracao;
  escura?: boolean;
  contexto?: string;
}

export interface TarefaArte {
  id: string;
  tipo: 'elenco' | 'ilustracao' | 'narracao' | 'exportacao';
  /** Cenas envolvidas (ilustrações), para a interface marcar onde a IA está trabalhando. */
  alvo?: number[];
  saida?: string; // exportação: link do vídeo pronto
  projeto: string;
  estado: 'rodando' | 'concluida' | 'erro' | 'cancelada';
  etapa: string;
  inicio: number;
  fim?: number;
  total: number;
  feitos: number;
  elenco?: Elenco;
  ilustracoes: { chave: string; svg?: string; src?: string }[];
  abortar?: AbortController;
  avisos: string[];
  erro?: string;
  custoUsd?: number;
  /** A interface já aplicou o resultado (ilustrações, elenco). */
  aplicada?: boolean;
  processos: Set<ChildProcess>;
}

const tarefas = new Map<string, TarefaArte>();

/** Erro com mensagem pronta para o usuário (narração, exportação). */
export class ErroTarefa extends Error {}
const PARALELO = 2;

export const obterTarefaArte = (id: string) => tarefas.get(id);
/** Ilustrações e elencos prontos há menos de 1 hora que ainda não chegaram ao plano. */
export const artesParaAplicar = (projeto?: string) =>
  [...tarefas.values()].filter(t => (t.tipo === 'ilustracao' || t.tipo === 'elenco') && t.estado === 'concluida' && !t.aplicada && Date.now() - (t.fim ?? 0) < 60 * 60 * 1000 && (!projeto || t.projeto === projeto));

/** Tarefas de arte, narração e exportação rodando agora. */
export const artesRodando = (projeto?: string) => [...tarefas.values()].filter(t => t.estado === 'rodando' && (!projeto || t.projeto === projeto));
export const arteAtiva = (projeto: string) => [...tarefas.values()].find(t => t.projeto === projeto && t.estado === 'rodando');

export function cancelarArte(id: string) {
  const t = tarefas.get(id);
  if (!t || t.estado !== 'rodando') return false;
  t.estado = 'cancelada';
  t.fim = Date.now();
  t.processos.forEach(p => p.kill());
  t.abortar?.abort();
  return true;
}

export const resumoArte = (t: TarefaArte, desde = 0) => {
  const { processos: _p, abortar: _a, ilustracoes, ...resto } = t;
  // A interface pede só as ilustrações novas (desde = quantas já recebeu).
  return { ...resto, ilustracoes: ilustracoes.slice(desde), recebidas: ilustracoes.length, segundos: Math.round(((t.fim ?? Date.now()) - t.inicio) / 1000) };
};

export function nova(tipo: TarefaArte['tipo'], projeto: string, total: number, etapa: string): TarefaArte {
  const t: TarefaArte = { id: randomUUID(), tipo, projeto, estado: 'rodando', etapa, inicio: Date.now(), total, feitos: 0, ilustracoes: [], avisos: [], processos: new Set() };
  tarefas.set(t.id, t);
  return t;
}

export const falhar = (t: TarefaArte, e: unknown) => {
  if (t.estado !== 'rodando') return;
  t.estado = 'erro';
  t.erro =
    e instanceof ErroClaude || e instanceof ErroGemini || e instanceof ErroTarefa
      ? e.message
      : `Falha inesperada: ${String((e as Error)?.message ?? e).split('\n')[0].slice(0, 200)}`;
  if (!(e instanceof ErroClaude || e instanceof ErroGemini || e instanceof ErroTarefa)) console.error(e);
  t.fim = Date.now();
};

export function iniciarElenco(projeto: string, roteiroTexto: string, plano: Plano | null): TarefaArte {
  const t = nova('elenco', projeto, 1, 'O Claude está montando o elenco e o estilo…');
  (async () => {
    const r = await perguntarClaude(
      { sistema: PROMPT_ELENCO, pedido: montarPedidoElenco(lerRoteiro(roteiroTexto), plano), schema: schemaElenco() },
      p => t.processos.add(p),
    );
    if (t.estado !== 'rodando') return;
    const d = r.dados as Partial<Elenco>;
    t.elenco = {
      estilo: String(d?.estilo ?? '').trim(),
      personagens: (Array.isArray(d?.personagens) ? d.personagens : [])
        .map(p => ({ nome: String(p?.nome ?? '').trim(), descricao: String(p?.descricao ?? '').trim() }))
        .filter(p => p.nome && p.descricao),
    };
    t.feitos = 1;
    t.custoUsd = r.custoUsd;
    t.estado = 'concluida';
    t.fim = Date.now();
  })().catch(e => falhar(t, e));
  return t;
}

export type Motor = 'claude' | 'gemini';

/** Lê a imagem de referência de um personagem (src "/arquivos/<projeto>/<arquivo>") da pasta de assets. */
async function lerReferencia(pastaAssets: string, src: string) {
  const nome = src.split('/').pop() ?? '';
  if (!/^[\w.-]+$/.test(nome)) return null;
  try {
    const dados = await readFile(path.join(pastaAssets, nome));
    const ext = path.extname(nome).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
    return { mime, dados };
  } catch {
    return null;
  }
}

/** Gera a imagem pelo Gemini e grava em assets; devolve o src público. */
export async function gerarImagemGemini(projeto: string, pastaAssets: string, prompt: string, proporcao: string, refs: string[], nomeBase: string, sinal?: AbortSignal) {
  const referencias = (await Promise.all(refs.map(r => lerReferencia(pastaAssets, r)))).filter(r => r !== null);
  const img = await gerarImagem({ prompt, proporcao, referencias, sinal });
  await mkdir(pastaAssets, { recursive: true });
  const arquivo = `${nomeBase}-${Date.now()}${extensaoDe(img.mime)}`;
  await writeFile(path.join(pastaAssets, arquivo), img.dados);
  return `/arquivos/${projeto}/${arquivo}`;
}

export function iniciarIlustracoes(
  projeto: string,
  pastaAssets: string,
  elenco: Elenco | null,
  itens: ItemIlustracao[],
  opcoes: { instrucoes?: string; qualidade?: 'rapida' | 'detalhada'; motor?: Motor } = {},
): TarefaArte {
  const { instrucoes, qualidade = 'detalhada', motor = 'claude' } = opcoes;
  const t = nova('ilustracao', projeto, itens.length, `${motor === 'gemini' ? 'Gerando' : 'Desenhando'}… 0 de ${itens.length} prontas`);
  t.abortar = new AbortController();
  t.alvo = [...new Set(itens.map(i => Number(/^c(\d+)-/.exec(i.chave)?.[1])).filter(n => n > 0))];
  const fila = [...itens];
  let custo = 0;

  const desenharSvg = async (item: ItemIlustracao) => {
    const { largura, altura } = tamanhoSlot(item.layout);
    const pedido = montarPedidoIlustracao({ descricao: item.descricao, largura, altura, escura: item.escura, contexto: item.contexto, instrucoes, cinema: item.layout === 'cinema' }, elenco);
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const esforco = qualidade === 'rapida' ? 'medium' : ((process.env.ESTUDIO_ESFORCO_ARTE as 'high' | 'xhigh' | undefined) ?? 'high');
      const r = await perguntarClaude({ sistema: PROMPT_ILUSTRADOR, pedido, schema: schemaIlustracao(), esforco, timeoutMs: 12 * 60_000 }, p => t.processos.add(p));
      custo += r.custoUsd ?? 0;
      try {
        const prefixo = `${item.chave}-${Date.now().toString(36)}`;
        return limparSvg(String((r.dados as { svg?: string })?.svg ?? ''), prefixo, `0 0 ${largura} ${altura}`);
      } catch (e) {
        if (!(e instanceof SvgInvalido) || tentativa === 2) throw e;
      }
    }
    throw new SvgInvalido('SVG inválido.');
  };

  const trabalhador = async () => {
    while (t.estado === 'rodando' && fila.length) {
      const item = fila.shift()!;
      try {
        if (motor === 'gemini') {
          const p = montarPromptImagem({ ...item, instrucoes }, elenco);
          const src = await gerarImagemGemini(projeto, pastaAssets, p.texto, p.proporcao, p.referencias.map(r => r.referencia!), `ilus-${item.chave}`, t.abortar!.signal);
          if (t.estado !== 'rodando') return;
          t.ilustracoes.push({ chave: item.chave, src });
        } else {
          const svg = await desenharSvg(item);
          if (t.estado !== 'rodando') return;
          t.ilustracoes.push({ chave: item.chave, svg });
          // Cópia de segurança: a ilustração não se perde mesmo se a página for fechada antes de salvar o plano.
          const dir = path.join(pastaAssets, 'ilustracoes');
          await mkdir(dir, { recursive: true });
          await writeFile(path.join(dir, `${item.chave}-${Date.now()}.svg`), svg);
        }
      } catch (e) {
        if (t.estado !== 'rodando') return;
        // Problemas gerais (login, chave, limite) param tudo.
        if ((e instanceof ErroClaude && /login|limite|limit/i.test(e.message)) || (e instanceof ErroGemini && /chave|limite|recusou/i.test(e.message))) throw e;
        t.avisos.push(`${item.chave}: ${e instanceof Error ? e.message : 'falhou'}`);
      } finally {
        t.feitos++;
        t.etapa = `${motor === 'gemini' ? 'Gerando' : 'Desenhando'}… ${t.feitos} de ${t.total} prontas`;
      }
    }
  };

  Promise.all(Array.from({ length: Math.min(motor === 'gemini' ? 3 : PARALELO, itens.length) }, trabalhador))
    .then(() => {
      if (t.estado !== 'rodando') return;
      t.estado = 'concluida';
      t.custoUsd = custo || undefined;
      t.etapa = `${t.ilustracoes.length} de ${t.total} ilustrações prontas.`;
      t.fim = Date.now();
    })
    .catch(e => {
      falhar(t, e);
      t.processos.forEach(p => p.kill());
      t.abortar?.abort();
    });
  return t;
}
