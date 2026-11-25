import type { CenaPlano, Elenco, Personagem, Plano, Projeto, ProjetoCompleto } from '../core/tipos';
import type { ConfigVozes, ManifestoNarracao } from '../core/vozes';

export type Qualidade = 'rapida' | 'detalhada';
export type Motor = 'claude' | 'gemini';

export interface ItemIlustracao {
  chave: string;
  descricao: string;
  layout: 'inteira' | 'dividida' | 'cinema';
  escura?: boolean;
  contexto?: string;
}

export interface TarefaArte {
  id: string;
  tipo: 'elenco' | 'ilustracao' | 'narracao' | 'exportacao';
  saida?: string;
  estado: 'rodando' | 'concluida' | 'erro' | 'cancelada';
  etapa: string;
  segundos: number;
  total: number;
  feitos: number;
  recebidas: number;
  elenco?: Elenco;
  ilustracoes: { chave: string; svg?: string; src?: string }[];
  avisos: string[];
  erro?: string;
}

export interface StatusIA {
  encontrado: boolean;
  logado: boolean;
  caminho: string | null;
  mensagem: string;
}

/** Tarefa rodando no servidor (direção, trilha, ilustração, narração, exportação). */
export interface TarefaAtiva {
  id: string;
  projeto: string;
  tipo: 'direcao' | 'som' | 'elenco' | 'ilustracao' | 'narracao' | 'exportacao';
  /** rodando, ou concluida e ainda não aplicada ao plano. */
  estado: 'rodando' | 'concluida';
  etapa: string;
  alvo: number[];
  segundos: number;
  feitos?: number;
  total?: number;
}

export interface Tarefa {
  id: string;
  tipo?: 'direcao' | 'som';
  alvo?: number[];
  estado: 'rodando' | 'concluida' | 'erro' | 'cancelada';
  etapa: string;
  segundos: number;
  cenas?: CenaPlano[];
  avisos: string[];
  erro?: string;
  custoUsd?: number;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  // X-Estudio: o servidor só aceita alterações vindas desta interface (protege contra outros sites).
  const r = await fetch(url, { ...init, headers: { 'X-Estudio': '1', ...(init?.headers as Record<string, string> | undefined) } });
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    throw new Error(corpo.erro ?? (r.status >= 502 ? 'O servidor local não respondeu. Confira se o estúdio está rodando.' : `Falha (${r.status}).`));
  }
  return r.status === 204 ? (undefined as T) : r.json();
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  listar: () => pedir<Projeto[]>('/api/projetos'),
  criar: (nome: string, roteiro = '', grupo = '') => pedir<Projeto>('/api/projetos', json('POST', { nome, roteiro, grupo })),
  mudarGrupo: (id: string, grupo: string) => pedir<Projeto>(`/api/projetos/${id}`, json('PATCH', { grupo })),
  tarefasAtivas: (projeto?: string) => pedir<TarefaAtiva[]>(`/api/tarefas${projeto ? `?projeto=${encodeURIComponent(projeto)}` : ''}`),
  sonorizar: (id: string, opcoes: { plano: Plano; cenas?: number[]; instrucoes?: string }) => pedir<Tarefa>(`/api/projetos/${id}/sonorizar`, json('POST', opcoes)),
  biblioteca: () => pedir<{ src: string; nome: string; categoria: string }[]>('/api/sons'),
  sons: (id: string) => pedir<{ src: string; nome: string; bytes: number }[]>(`/api/projetos/${id}/sons`),
  abrir: (id: string) => pedir<ProjetoCompleto>(`/api/projetos/${id}`),
  renomear: (id: string, nome: string) => pedir<Projeto>(`/api/projetos/${id}`, json('PATCH', { nome })),
  excluir: (id: string) => pedir<void>(`/api/projetos/${id}`, { method: 'DELETE' }),
  salvarRoteiro: (id: string, texto: string) => pedir(`/api/projetos/${id}/roteiro`, json('PUT', { texto })),
  salvarPlano: (id: string, plano: Plano) => pedir(`/api/projetos/${id}/plano`, json('PUT', { plano })),
  statusIA: () => pedir<StatusIA>('/api/ia/status'),
  statusPiper: () => pedir<{ instalado: boolean; vozes: string[]; mensagem: string }>('/api/vozes/status'),
  vozes: (id: string) => pedir<ConfigVozes>(`/api/projetos/${id}/vozes`),
  salvarVozes: (id: string, cfg: ConfigVozes) => pedir<ConfigVozes>(`/api/projetos/${id}/vozes`, json('PUT', cfg)),
  amostraVoz: (voz: string, velocidade: number, texto?: string, tom = 0) => pedir<{ src: string }>('/api/vozes/amostra', json('POST', { voz, velocidade, texto, tom })),
  manifestoNarracao: (id: string) => pedir<ManifestoNarracao>(`/api/projetos/${id}/narracao`),
  gerarNarracao: (id: string, plano: Plano) => pedir<TarefaArte>(`/api/projetos/${id}/narracao`, json('POST', { plano })),
  exportar: (id: string) => pedir<TarefaArte>(`/api/projetos/${id}/exportar`, json('POST', {})),
  exportacoes: (id: string) => pedir<{ nome: string; src: string; bytes: number; data: string }[]>(`/api/projetos/${id}/exportacoes`),
  rascunho: (id: string) => pedir<{ salvoEm: string; plano: Plano } | null>(`/api/projetos/${id}/rascunho`),
  salvarRascunho: (id: string, plano: Plano) => pedir(`/api/projetos/${id}/rascunho`, json('PUT', { plano })),
  descartarRascunho: (id: string) => pedir<void>(`/api/projetos/${id}/rascunho`, { method: 'DELETE' }),
  elenco: (id: string) => pedir<Elenco>(`/api/projetos/${id}/elenco`),
  salvarElenco: (id: string, e: Elenco) => pedir<Elenco>(`/api/projetos/${id}/elenco`, json('PUT', e)),
  gerarElenco: (id: string, plano: Plano | null) => pedir<TarefaArte>(`/api/projetos/${id}/elenco/gerar`, json('POST', { plano })),
  ilustrar: (id: string, itens: ItemIlustracao[], instrucoes?: string, qualidade: Qualidade = 'detalhada', motor: Motor = 'claude') =>
    pedir<TarefaArte>(`/api/projetos/${id}/ilustrar`, json('POST', { itens, instrucoes, qualidade, motor })),
  statusImagens: () => pedir<{ configurado: boolean; modelo: string; mensagem: string }>('/api/ia/imagens'),
  gerarReferencia: (id: string, personagem: Personagem, estilo: string) => pedir<{ src: string }>(`/api/projetos/${id}/elenco/referencia`, json('POST', { personagem, estilo })),
  tarefaArte: (id: string, desde: number) => pedir<TarefaArte>(`/api/tarefas/${id}?desde=${desde}`),
  dirigir: (id: string, opcoes: { cenas?: number[]; instrucoes?: string; formato?: 'livro' | 'cinema' }) => pedir<Tarefa>(`/api/projetos/${id}/dirigir`, json('POST', opcoes)),
  tarefa: (id: string) => pedir<Tarefa>(`/api/tarefas/${id}`),
  marcarAplicada: (id: string) => pedir<void>(`/api/tarefas/${id}/aplicada`, json('POST', {})),
  cancelarTarefa: (id: string) => pedir<void>(`/api/tarefas/${id}`, { method: 'DELETE' }),
  enviarArte: (id: string, arquivo: File) =>
    pedir<{ src: string }>(`/api/projetos/${id}/assets`, {
      method: 'POST',
      headers: { 'x-nome-arquivo': encodeURIComponent(arquivo.name), 'Content-Type': 'application/octet-stream' },
      body: arquivo,
    }),
};
