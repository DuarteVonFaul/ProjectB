import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { comIlustracoes, ilustracoesDoPasso } from '../web/src/core/cinema';
import { montarPedido, PROMPT_SISTEMA, PROMPT_SISTEMA_CINEMA } from '../web/src/core/promptDiretor';
import { lerRoteiro } from '../web/src/core/roteiro';
import type { CenaPlano, Elenco, Formato, Ilustracao, Plano } from '../web/src/core/tipos';
import { estadoAntesDa } from '../web/src/core/promptDiretor';
import { schemaResposta, validarCenas } from '../web/src/core/validar';
import { ErroClaude, perguntarClaude } from './claude';
import { mesclarSom, pedidoSonoplastia, PROMPT_SONOPLASTA, schemaSonoplastia, type SomGravado } from '../web/src/core/som';

/** Tarefas de direção com IA (rodam em segundo plano; a interface consulta o andamento). */

export interface Tarefa {
  id: string;
  projeto: string;
  /** direcao: plano de animação; som: trilha sonora. */
  tipo: 'direcao' | 'som';
  /** Cenas em que a IA está trabalhando (vazio = o plano todo). */
  alvo: number[];
  estado: 'rodando' | 'concluida' | 'erro' | 'cancelada';
  etapa: string;
  inicio: number;
  fim?: number;
  cenas?: CenaPlano[];
  avisos: string[];
  erro?: string;
  custoUsd?: number;
  /** A interface já aplicou o resultado ao plano. */
  aplicada?: boolean;
  processo?: ChildProcess;
}

const tarefas = new Map<string, Tarefa>();
const TENTATIVAS = 2;

export const obterTarefa = (id: string) => tarefas.get(id);
export const tarefaAtiva = (projeto: string) => [...tarefas.values()].find(t => t.projeto === projeto && t.estado === 'rodando');

export function cancelarTarefa(id: string) {
  const t = tarefas.get(id);
  if (!t || t.estado !== 'rodando') return;
  t.estado = 'cancelada';
  t.fim = Date.now();
  t.processo?.kill();
}

/** Leva as artes que o usuário já enviou para as páginas correspondentes do novo plano (mesma ordem). */
function preservarArtes(novas: CenaPlano[], antigo: Plano | null, formato: Formato) {
  if (!antigo || (antigo.formato ?? 'livro') !== formato) return; // formatos diferentes: as posições não batem
  for (const c of novas) {
    const velha = antigo.cenas.find(x => x.numero === c.numero);
    if (!velha) continue;
    const ilusVelhas = velha.passos.map(ilustracoesDoPasso).filter((x): x is Ilustracao[] => !!x);
    let k = 0;
    c.passos = c.passos.map(p => {
      const ils = ilustracoesDoPasso(p);
      if (!ils) return p;
      const antigas = ilusVelhas[k++] ?? [];
      return comIlustracoes(p, ils.map((il, i): Ilustracao => {
        const a = antigas[i];
        return a && a.fonte !== 'esboco' ? { ...a, descricao: il.descricao || a.descricao } : il;
      }));
    });
  }
}

export function iniciarDirecao(projeto: string, roteiroTexto: string, plano: Plano | null, opcoes: { cenas?: number[]; instrucoes?: string; formato?: Formato; elenco?: Elenco | null }): Tarefa {
  const formato: Formato = opcoes.formato === 'cinema' ? 'cinema' : 'livro';
  const tarefa: Tarefa = { id: randomUUID(), projeto, tipo: 'direcao', alvo: opcoes.cenas ?? [], estado: 'rodando', etapa: 'Preparando o roteiro…', inicio: Date.now(), avisos: [] };
  tarefas.set(tarefa.id, tarefa);

  (async () => {
    const roteiro = lerRoteiro(roteiroTexto);
    const alvo = roteiro.cenas.filter(c => !opcoes.cenas?.length || opcoes.cenas.includes(c.numero));
    if (!alvo.length) throw new ErroClaude('O roteiro não tem as cenas pedidas.');
    const inicio = opcoes.cenas?.length ? estadoAntesDa(plano, alvo[0].numero) : { livroAberto: false, queimado: false };
    let pedido = montarPedido(roteiro, { ...opcoes, formato, plano });
    let custo = 0;

    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      tarefa.etapa = tentativa === 1 ? `O Claude está dirigindo ${alvo.length === 1 ? `a cena ${alvo[0].numero}` : `${alvo.length} cenas`}…` : 'Corrigindo problemas apontados na primeira versão…';
      const r = await perguntarClaude(
        { sistema: formato === 'cinema' ? PROMPT_SISTEMA_CINEMA : PROMPT_SISTEMA, pedido, schema: schemaResposta(formato) },
        p => (tarefa.processo = p),
      );
      if (tarefa.estado !== 'rodando') return;
      custo += r.custoUsd ?? 0;
      const { cenas, erros } = validarCenas(r.dados, alvo, inicio, formato);
      if (!erros.length || tentativa === TENTATIVAS) {
        preservarArtes(cenas, plano, formato);
        tarefa.cenas = cenas;
        tarefa.avisos = erros;
        tarefa.estado = 'concluida';
        tarefa.custoUsd = custo || undefined;
        tarefa.fim = Date.now();
        return;
      }
      pedido += `\n\n## Sua resposta anterior\n${JSON.stringify(r.dados)}\n\n## Problemas encontrados nela\n${erros.map(e => `- ${e}`).join('\n')}\n\nDevolva a versão corrigida completa.`;
    }
  })().catch(e => {
    if (tarefa.estado !== 'rodando') return;
    tarefa.estado = 'erro';
    tarefa.erro = e instanceof ErroClaude ? e.message : 'Falha inesperada ao falar com o Claude.';
    if (!(e instanceof ErroClaude)) console.error(e);
    tarefa.fim = Date.now();
  });

  return tarefa;
}

/** Sonoplastia: o Claude refaz a música e os efeitos sonoros das cenas pedidas (ou de todas). */
export function iniciarSonoplastia(projeto: string, plano: Plano, opcoes: { cenas?: number[]; instrucoes?: string; biblioteca?: SomGravado[] }): Tarefa {
  const cenas = opcoes.cenas ?? [];
  const alvo = plano.cenas.filter(c => !cenas.length || cenas.includes(c.numero));
  const tarefa: Tarefa = {
    id: randomUUID(), projeto, tipo: 'som', alvo: cenas, estado: 'rodando', inicio: Date.now(), avisos: [],
    etapa: `O Claude está compondo a trilha ${alvo.length === 1 ? `da cena ${alvo[0].numero}` : `de ${alvo.length} cenas`}…`,
  };
  tarefas.set(tarefa.id, tarefa);
  (async () => {
    if (!alvo.length) throw new ErroClaude('O plano não tem as cenas pedidas.');
    const r = await perguntarClaude(
      { sistema: PROMPT_SONOPLASTA, pedido: pedidoSonoplastia(plano, cenas, opcoes.instrucoes, opcoes.biblioteca), schema: schemaSonoplastia(opcoes.biblioteca) },
      p => (tarefa.processo = p),
    );
    if (tarefa.estado !== 'rodando') return;
    const lista: any[] = Array.isArray((r.dados as any)?.cenas) ? (r.dados as any).cenas : [];
    const avisos: string[] = [];
    tarefa.cenas = alvo.map(c => {
      const resp = lista.find(x => Number(x?.numero) === c.numero);
      if (!resp) {
        avisos.push(`A cena ${c.numero} não veio na resposta (ficou como estava).`);
        return c;
      }
      return mesclarSom(c, Array.isArray(resp.passos) ? resp.passos : [], avisos);
    });
    tarefa.avisos = avisos;
    tarefa.custoUsd = r.custoUsd;
    tarefa.estado = 'concluida';
    tarefa.fim = Date.now();
  })().catch(e => {
    if (tarefa.estado !== 'rodando') return;
    tarefa.estado = 'erro';
    tarefa.erro = e instanceof ErroClaude ? e.message : `Falha inesperada ao falar com o Claude: ${String((e as Error)?.message ?? e).split('\n')[0]}`;
    if (!(e instanceof ErroClaude)) console.error(e);
    tarefa.fim = Date.now();
  });
  return tarefa;
}

/** Resultados prontos há menos de 1 hora que ainda não foram aplicados ao plano. */
const LIMITE_PRONTA = 60 * 60 * 1000;
export const tarefasParaAplicar = (projeto?: string) =>
  [...tarefas.values()].filter(t => t.estado === 'concluida' && !t.aplicada && Date.now() - (t.fim ?? 0) < LIMITE_PRONTA && (!projeto || t.projeto === projeto));

/** Tarefas de IA rodando agora (todas ou de um projeto). */
export const tarefasRodando = (projeto?: string) => [...tarefas.values()].filter(t => t.estado === 'rodando' && (!projeto || t.projeto === projeto));

export const resumoTarefa = (t: Tarefa) => {
  const { processo: _p, ...resto } = t;
  return { ...resto, segundos: Math.round(((t.fim ?? Date.now()) - t.inicio) / 1000) };
};
