import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, type TarefaAtiva } from './api';

/**
 * O que a IA (e o servidor) está fazendo agora. O editor consulta o servidor e todas as abas leem daqui:
 * a faixa no topo, os selos nas cenas e a retomada das tarefas quando se volta para uma aba.
 */

export const ROTULO_TAREFA: Record<TarefaAtiva['tipo'], { nome: string; aba: string; ia: boolean }> = {
  direcao: { nome: 'Direção', aba: 'plano', ia: true },
  som: { nome: 'Trilha sonora', aba: 'som', ia: true },
  ilustracao: { nome: 'Ilustrações', aba: 'plano', ia: true },
  elenco: { nome: 'Elenco', aba: 'elenco', ia: true },
  narracao: { nome: 'Narração', aba: 'video', ia: false },
  exportacao: { nome: 'Exportação do vídeo', aba: 'video', ia: false },
};

const Ctx = createContext<{ ativas: TarefaAtiva[]; recarregar: () => void }>({ ativas: [], recarregar: () => {} });
export const useTarefas = () => useContext(Ctx);

/** Consulta as tarefas rodando (mais rápido enquanto há alguma). */
export function ProvedorTarefas({ projeto, children }: { projeto?: string; children: React.ReactNode }) {
  const [ativas, setAtivas] = useState<TarefaAtiva[]>([]);
  const [tique, setTique] = useState(0);
  useEffect(() => {
    let cancelado = false;
    api.tarefasAtivas(projeto).then(l => { if (!cancelado) setAtivas(l); }).catch(() => {});
    const t = setTimeout(() => setTique(x => x + 1), ativas.length ? 1500 : 4000);
    return () => { cancelado = true; clearTimeout(t); };
  }, [projeto, tique]); // eslint-disable-line react-hooks/exhaustive-deps
  const recarregar = useCallback(() => setTique(x => x + 1), []);
  return <Ctx.Provider value={{ ativas, recarregar }}>{children}</Ctx.Provider>;
}

/** A tarefa de IA que está trabalhando nesta cena (alvo vazio = o plano todo). */
export function tarefaNaCena(ativas: TarefaAtiva[], cena: number, tipos: TarefaAtiva['tipo'][] = ['direcao', 'som', 'ilustracao']) {
  return ativas.find(t => t.estado === 'rodando' && tipos.includes(t.tipo) && (!t.alvo.length || t.alvo.includes(cena)));
}
export const rodando = (ativas: TarefaAtiva[]) => ativas.filter(t => t.estado === 'rodando');

const tempo = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`);

/** Faixa animada abaixo do topo enquanto algo roda. */
export function FaixaIA({ idProjeto }: { idProjeto: string }) {
  const { ativas } = useTarefas();
  if (!ativas.length) return null;
  return (
    <div className="faixa-ia" role="status" aria-live="polite">
      {ativas.map(t => {
        const r = ROTULO_TAREFA[t.tipo];
        const onde = !r.ia || t.tipo === 'elenco' ? '' : t.alvo.length ? ` · ${t.alvo.length === 1 ? 'cena' : 'cenas'} ${t.alvo.join(', ')}` : ' · plano todo';
        if (t.estado === 'concluida')
          return (
            <a key={t.id} className="faixa-ia-item pronta" href={`#/p/${idProjeto}/${r.aba}`}>
              <strong>✓ Pronto</strong>
              <span>{r.nome}{onde}</span>
              <span className="sutil">terminou enquanto você estava em outra aba. Abra a aba para aplicar ao plano.</span>
            </a>
          );
        return (
          <a key={t.id} className={`faixa-ia-item${r.ia ? ' ia' : ''}`} href={`#/p/${idProjeto}/${r.aba}`}>
            <span className="orbe" aria-hidden />
            <strong>{r.ia ? '✦ Claude trabalhando' : 'Em andamento'}</strong>
            <span>{r.nome}{onde}</span>
            <span className="sutil">{t.etapa}</span>
            {t.total && t.total > 1 ? <progress max={t.total} value={t.feitos ?? 0} /> : null}
            <span className="sutil">{tempo(t.segundos)}</span>
          </a>
        );
      })}
    </div>
  );
}

/** Selo dentro de uma cena em que a IA está trabalhando. */
export function SeloIA({ tarefa }: { tarefa: TarefaAtiva }) {
  const r = ROTULO_TAREFA[tarefa.tipo];
  return (
    <span className="selo-trabalhando" role="status">
      <span className="orbe" aria-hidden /> {r.nome === 'Direção' ? 'Claude dirigindo esta cena…' : r.nome === 'Trilha sonora' ? 'Claude compondo o som desta cena…' : 'Gerando as ilustrações desta cena…'}
    </span>
  );
}
