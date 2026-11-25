import { useEffect, useRef, useState } from 'react';
import { comIlustracoes, ilustracoesDoPasso } from '../core/cinema';
import type { LayoutIlustracao } from '../core/promptIlustrador';
import type { Ilustracao, Plano } from '../core/tipos';
import { api, type ItemIlustracao, type Motor, type Qualidade, type TarefaArte } from './api';
import type { StatusImagens } from './Imagens';

/** Acompanha uma tarefa de arte; entrega as ilustrações novas assim que chegam. */
export function useTarefaArte(aoReceber: (t: TarefaArte) => void) {
  const [tarefa, setTarefa] = useState<TarefaArte | null>(null);
  const [erro, setErro] = useState('');
  const recebidas = useRef(0);
  const vistas = useRef(new Set<string>()); // tarefas já acompanhadas (não retoma de novo)
  const cb = useRef(aoReceber);
  cb.current = aoReceber;

  useEffect(() => {
    if (!tarefa || tarefa.estado !== 'rodando') return;
    const t = setTimeout(async () => {
      try {
        const nova = await api.tarefaArte(tarefa.id, recebidas.current);
        recebidas.current = nova.recebidas;
        if (nova.ilustracoes.length || nova.elenco) cb.current(nova);
        if (nova.estado === 'concluida') api.marcarAplicada(nova.id).catch(() => {});
        setTarefa(nova);
      } catch (e) {
        setErro((e as Error).message);
        setTarefa(null);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [tarefa]);

  return {
    tarefa,
    erro,
    rodando: tarefa?.estado === 'rodando',
    async iniciar(fn: () => Promise<TarefaArte>) {
      setErro('');
      recebidas.current = 0;
      try {
        const t = await fn();
        vistas.current.add(t.id);
        setTarefa(t);
      } catch (e) {
        setErro((e as Error).message);
      }
    },
    /** Volta a acompanhar uma tarefa que já está rodando no servidor (recebe de novo o que ela já produziu). */
    retomar(t: { id: string; tipo: string; etapa?: string; feitos?: number; total?: number }) {
      if (vistas.current.has(t.id)) return;
      vistas.current.add(t.id);
      recebidas.current = 0;
      setTarefa({ id: t.id, tipo: t.tipo as TarefaArte['tipo'], estado: 'rodando', etapa: t.etapa ?? 'Em andamento…', segundos: 0, total: t.total ?? 1, feitos: t.feitos ?? 0, recebidas: 0, ilustracoes: [], avisos: [] });
    },
    async cancelar() {
      if (tarefa) await api.cancelarTarefa(tarefa.id).catch(() => {});
      setTarefa(t => (t ? { ...t, estado: 'cancelada' } : t));
    },
  };
}

export type TarefaArteCtl = ReturnType<typeof useTarefaArte>;

/** A ilustração já tem arte de verdade (e não só a marcação de fonte)? */
export const temArte = (il: Ilustracao) => (il.fonte === 'svg' && !!il.svg?.trim()) || (il.fonte === 'imagem' && !!il.src);

/** Lista as ilustrações do plano com a chave que o servidor usa (cena, passo visual e espaço). */
export function ilustracoesDoPlano(plano: Plano) {
  const lista: { chave: string; cena: number; il: Ilustracao; layout: LayoutIlustracao; escura?: boolean; contexto: string }[] = [];
  for (const c of plano.cenas) {
    let k = 0;
    c.passos.forEach((p, i) => {
      const ils = ilustracoesDoPasso(p);
      if (!ils) return;
      // O que é dito enquanto esta imagem está à vista.
      const ditos: string[] = [];
      for (let j = i + 1; j < c.passos.length && !ilustracoesDoPasso(c.passos[j]); j++) {
        const q = c.passos[j];
        if (q.tipo === 'narrar') ditos.push(q.personagem ? `${q.personagem}: ${q.texto}` : q.texto);
      }
      const layout: LayoutIlustracao = p.tipo === 'mostrar' ? 'cinema' : 'pagina' in p ? p.pagina.layout : 'inteira';
      const escura = p.tipo === 'mostrar' ? p.escura : 'pagina' in p ? p.pagina.escura : undefined;
      const qtd = layout === 'dividida' ? 2 : 1;
      for (let sl = 0; sl < qtd; sl++) {
        const il = ils[sl];
        if (il) lista.push({ chave: `c${c.numero}-p${k}-s${sl}`, cena: c.numero, il, layout, escura, contexto: ditos.join(' ') });
      }
      k++;
    });
  }
  return lista;
}

export const itemDe = (x: ReturnType<typeof ilustracoesDoPlano>[number]): ItemIlustracao => ({
  chave: x.chave,
  descricao: x.il.descricao,
  layout: x.layout,
  escura: x.escura,
  contexto: x.contexto.slice(0, 1200),
});

/** Coloca as ilustrações recebidas nos lugares certos do plano. */
export function aplicarIlustracoes(plano: Plano, recebidas: { chave: string; svg?: string; src?: string }[]): Plano {
  const mapa = new Map(recebidas.map(r => [r.chave, r]));
  return {
    ...plano,
    cenas: plano.cenas.map(c => {
      let k = 0;
      return {
        ...c,
        passos: c.passos.map(p => {
          const atuais = ilustracoesDoPasso(p);
          if (!atuais) return p;
          const pk = k++;
          const ils = atuais.map((il, sl) => {
            const r = mapa.get(`c${c.numero}-p${pk}-s${sl}`);
            if (r?.src) return { descricao: il.descricao, fonte: 'imagem' as const, src: r.src };
            if (r?.svg) return { descricao: il.descricao, fonte: 'svg' as const, svg: r.svg };
            return il;
          });
          return comIlustracoes(p, ils);
        }),
      };
    }),
  };
}

export function PainelIlustracoes(props: {
  plano: Plano;
  ctl: TarefaArteCtl;
  temElenco: boolean;
  idProjeto: string;
  onDesenhar: (somenteFaltando: boolean, instrucoes: string) => void;
  qualidade: Qualidade;
  onQualidade: (q: Qualidade) => void;
  motor: Motor;
  onMotor: (m: Motor) => void;
  gemini: StatusImagens | null;
}) {
  const { plano, ctl, temElenco, idProjeto, onDesenhar, qualidade, onQualidade, motor, onMotor, gemini } = props;
  const todas = ilustracoesDoPlano(plano).filter(x => x.il.descricao.trim());
  const faltando = todas.filter(x => !temArte(x.il));
  const [instrucoes, setInstrucoes] = useState('');
  const { tarefa, erro, rodando } = ctl;
  const semChave = motor === 'gemini' && !gemini?.configurado;
  return (
    <section className="painel-claude" aria-label="Ilustrações">
      <div className="pc-topo">
        <h2><span className="estrela" aria-hidden>✦</span> Ilustrações</h2>
        <span className="sutil">{todas.length - faltando.length} de {todas.length} prontas</span>
        <label className="campo direita">Motor
          <select value={motor} onChange={e => onMotor(e.target.value as Motor)} disabled={rodando}>
            <option value="gemini">Gemini · imagem (API)</option>
            <option value="claude">Claude · desenho SVG</option>
          </select>
        </label>
      </div>
      {!temElenco && (
        <p className="alerta">Monte o <a href={`#/p/${idProjeto}/elenco`}>elenco e estilo</a> antes: é ele que mantém os personagens iguais em todas as páginas.</p>
      )}
      {semChave && (
        <p className="alerta">{gemini?.mensagem ?? 'Gemini sem chave.'} Sem chave, use o modo manual: em cada ilustração, "Copiar prompt", gere no app do Gemini e cole a imagem de volta.</p>
      )}
      {!rodando ? (
        <div className="pc-pedido">
          <textarea rows={2} value={instrucoes} onChange={e => setInstrucoes(e.target.value)} placeholder="Pedido opcional para todas as ilustrações, ex.: mais contraste, menos detalhes no fundo" aria-label="Pedido para todas as ilustrações" />
          <div className="pc-botoes">
            {motor === 'claude' && (
              <label className="campo">Qualidade
                <select value={qualidade} onChange={e => onQualidade(e.target.value as Qualidade)}>
                  <option value="detalhada">Detalhada (~5 min cada)</option>
                  <option value="rapida">Rápida (~1 min cada, mais simples)</option>
                </select>
              </label>
            )}
            <button className="primario" disabled={!faltando.length || semChave} onClick={() => onDesenhar(true, instrucoes)}>
              {motor === 'gemini' ? 'Gerar' : 'Desenhar'} {faltando.length} que faltam
            </button>
            {todas.length > faltando.length && (
              <button className="fantasma" disabled={semChave} onClick={() => onDesenhar(false, instrucoes)}>Refazer todas ({todas.length})</button>
            )}
          </div>
        </div>
      ) : (
        <div className="pc-andamento" role="status">
          <span className="girando" aria-hidden />
          <span>{tarefa?.etapa}</span>
          <progress max={tarefa?.total ?? 1} value={tarefa?.feitos ?? 0} />
          <span className="sutil">{tarefa?.segundos ?? 0}s</span>
          <button className="fantasma" onClick={ctl.cancelar}>Cancelar</button>
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
      {tarefa?.estado === 'erro' && <p className="erro">{tarefa.erro}</p>}
      {tarefa && tarefa.estado !== 'rodando' && tarefa.avisos.length > 0 && (
        <details className="pc-feito"><summary>{tarefa.avisos.length} ilustração(ões) falharam</summary><ul>{tarefa.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
      )}
      {tarefa?.estado === 'concluida' && <p className="ok">Pronto. As ilustrações já estão no plano: revise e salve.</p>}
      <p className="sutil pc-nota">
        {motor === 'gemini'
          ? `Gemini (${gemini?.modelo || 'Nano Banana'}): poucos segundos por imagem, três por vez, cobrado por imagem na sua conta do Google AI Studio. As folhas dos personagens (aba Elenco) vão junto como referência.`
          : 'Claude: cada desenho é uma chamada à CLI (duas por vez) e consome bem mais do limite do seu plano do que a direção. Cópias em assets/ilustracoes.'}
      </p>
    </section>
  );
}
