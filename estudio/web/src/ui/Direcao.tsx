import { useEffect, useRef, useState } from 'react';
import { api, type StatusIA, type Tarefa } from './api';

/** Acompanha uma tarefa de direção com o Claude (inicia, consulta o andamento e cancela). */
export function useDirecao(id: string, aoConcluir: (t: Tarefa, cenas?: number[]) => void) {
  const [tarefa, setTarefa] = useState<Tarefa | null>(null);
  const [pedidas, setPedidas] = useState<number[] | undefined>();
  const [erro, setErro] = useState('');
  const vistas = useRef(new Set<string>()); // tarefas já acompanhadas (não retoma de novo)
  const concluir = useRef(aoConcluir);
  concluir.current = aoConcluir;

  useEffect(() => {
    if (!tarefa || tarefa.estado !== 'rodando') return;
    const t = setTimeout(async () => {
      try {
        const nova = await api.tarefa(tarefa.id);
        setTarefa(nova);
        if (nova.estado === 'concluida') {
          concluir.current(nova, pedidas);
          api.marcarAplicada(nova.id).catch(() => {});
        }
      } catch (e) {
        setErro((e as Error).message);
        setTarefa(null);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [tarefa, pedidas]);

  return {
    tarefa,
    erro,
    rodando: tarefa?.estado === 'rodando',
    async iniciar(opcoes: { cenas?: number[]; instrucoes?: string; formato?: 'livro' | 'cinema' }) {
      return this.iniciarCom(() => api.dirigir(id, opcoes), opcoes.cenas);
    },
    /** Inicia outra tarefa do Claude que devolve cenas (ex.: a trilha sonora). */
    async iniciarCom(fn: () => Promise<Tarefa>, cenas?: number[]) {
      setErro('');
      try {
        setPedidas(cenas);
        const t = await fn();
        vistas.current.add(t.id);
        setTarefa(t);
      } catch (e) {
        setErro((e as Error).message);
      }
    },
    /** Volta a acompanhar uma tarefa que já está rodando no servidor (ex.: depois de trocar de aba). */
    retomar(t: { id: string; alvo?: number[]; etapa?: string }) {
      if (vistas.current.has(t.id)) return;
      vistas.current.add(t.id);
      setPedidas(t.alvo?.length ? t.alvo : undefined);
      setTarefa({ id: t.id, estado: 'rodando', etapa: t.etapa ?? 'Em andamento…', segundos: 0, avisos: [] });
    },
    async cancelar() {
      if (tarefa) await api.cancelarTarefa(tarefa.id).catch(() => {});
      setTarefa(t => (t ? { ...t, estado: 'cancelada' } : t));
    },
    limpar() {
      setTarefa(null);
      setErro('');
    },
  };
}

export type Direcao = ReturnType<typeof useDirecao>;

export function PainelClaude({ direcao, temPlano, onDirigir }: { direcao: Direcao; temPlano: boolean; onDirigir: (instrucoes: string) => void }) {
  const [status, setStatus] = useState<StatusIA | null>(null);
  const [instrucoes, setInstrucoes] = useState('');
  const verificar = () => { setStatus(null); api.statusIA().then(setStatus).catch(e => setStatus({ encontrado: false, logado: false, caminho: null, mensagem: e.message })); };
  useEffect(verificar, []);
  const { tarefa, erro, rodando } = direcao;

  return (
    <section className="painel-claude" aria-label="Direção com Claude">
      <div className="pc-topo">
        <h2><span className="estrela" aria-hidden>✦</span> Direção com Claude</h2>
        {status && (
          <span className={`status ${status.logado ? 'ok' : 'erro'}`}>
            {status.logado ? 'Conectado' : status.encontrado ? 'Sem login' : 'CLI não encontrada'}
          </span>
        )}
      </div>
      {status && !status.logado && (
        <div className="alerta">
          <p>{status.mensagem}</p>
          <p className="sutil">Depois de entrar, <button className="link" onClick={verificar}>verifique de novo</button>.</p>
        </div>
      )}
      {!rodando ? (
        <div className="pc-pedido">
          <textarea
            rows={2}
            value={instrucoes}
            onChange={e => setInstrucoes(e.target.value)}
            placeholder="Pedido opcional para o diretor, ex.: ritmo mais lento nas cenas tristes, mais páginas divididas"
            aria-label="Pedido para o diretor"
          />
          <button className="primario" disabled={!status?.logado} onClick={() => onDirigir(instrucoes)}>
            {temPlano ? 'Dirigir tudo de novo com Claude' : 'Dirigir com Claude'}
          </button>
        </div>
      ) : (
        <div className="pc-andamento" role="status">
          <span className="girando" aria-hidden />
          <span>{tarefa?.etapa}</span>
          <span className="sutil">{tarefa?.segundos ?? 0}s</span>
          <button className="fantasma" onClick={direcao.cancelar}>Cancelar</button>
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
      {tarefa?.estado === 'erro' && <p className="erro">{tarefa.erro}</p>}
      {tarefa?.estado === 'concluida' && (
        <div className="pc-feito">
          <p className="ok">Pronto em {tarefa.segundos}s. Revise as cenas marcadas e salve o plano.</p>
          {tarefa.avisos.length > 0 && (
            <details>
              <summary>{tarefa.avisos.length} ponto(s) para conferir</summary>
              <ul>{tarefa.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      <p className="sutil pc-nota">O Claude roda pela CLI do Claude Code com a sua assinatura. Cada direção consome parte do limite de uso do seu plano.</p>
    </section>
  );
}
