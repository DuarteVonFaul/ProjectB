import { useCallback, useEffect, useState } from 'react';
import type { Plano, Projeto } from '../core/tipos';
import { api } from './api';
import type { Aba } from './App';
import { AbaAssistir } from './AbaAssistir';
import { AbaElenco } from './AbaElenco';
import { AbaPlano } from './AbaPlano';
import { AbaRoteiro } from './AbaRoteiro';
import { AbaSom } from './AbaSom';
import { AbaVideo } from './AbaVideo';
import { FaixaIA, ProvedorTarefas, ROTULO_TAREFA, useTarefas } from './Tarefas';

export const hashTexto = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export function EditorProjeto(props: { id: string; aba: Aba }) {
  return (
    <ProvedorTarefas projeto={props.id}>
      <Editor {...props} />
    </ProvedorTarefas>
  );
}

function Editor({ id, aba }: { id: string; aba: Aba }) {
  const { ativas } = useTarefas();
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [roteiro, setRoteiro] = useState('');
  const [roteiroSalvo, setRoteiroSalvo] = useState('');
  const [plano, setPlano] = useState<Plano | null>(null);
  const [planoSujo, setPlanoSujo] = useState(false);
  const [rascunho, setRascunho] = useState<{ salvoEm: string; plano: Plano } | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.abrir(id).then(async d => {
      setProjeto(d.projeto);
      setRoteiro(d.roteiro);
      setRoteiroSalvo(d.roteiro);
      setPlano(d.plano);
      const r = await api.rascunho(id).catch(() => null);
      if (r?.plano && JSON.stringify(r.plano) !== JSON.stringify(d.plano)) setRascunho(r);
    }).catch(e => setErro(e.message));
  }, [id]);

  // Guarda as alterações não salvas do plano como rascunho no servidor.
  useEffect(() => {
    if (!planoSujo || !plano) return;
    const t = setTimeout(() => api.salvarRascunho(id, plano).catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, [id, plano, planoSujo]);

  const roteiroSujo = roteiro !== roteiroSalvo;
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (roteiroSujo || planoSujo) e.preventDefault(); };
    addEventListener('beforeunload', f);
    return () => removeEventListener('beforeunload', f);
  }, [roteiroSujo, planoSujo]);

  const salvarRoteiro = useCallback(async () => {
    await api.salvarRoteiro(id, roteiro);
    setRoteiroSalvo(roteiro);
  }, [id, roteiro]);

  const salvarPlano = useCallback(async (p: Plano) => {
    await api.salvarPlano(id, p);
    setPlano(p);
    setPlanoSujo(false);
    setRascunho(null);
    api.descartarRascunho(id).catch(() => {});
  }, [id]);

  async function renomear() {
    if (!projeto) return;
    const nome = prompt('Novo nome do projeto:', projeto.nome);
    if (nome?.trim()) setProjeto(await api.renomear(id, nome.trim()));
  }

  if (erro) return <div className="lista"><p className="erro">{erro}</p><a href="#/">Voltar aos projetos</a></div>;
  if (!projeto) return <div className="lista"><p className="sutil">Carregando…</p></div>;

  const desatualizado = !!plano?.roteiroHash && plano.roteiroHash !== hashTexto(roteiro);
  const abas: [Aba, string][] = [['roteiro', 'Roteiro'], ['elenco', 'Elenco e estilo'], ['plano', 'Plano de animação'], ['som', 'Música e efeitos'], ['assistir', 'Assistir'], ['video', 'Vozes e vídeo']];
  const abaOcupada = (k: Aba) => ativas.some(t => ROTULO_TAREFA[t.tipo].aba === k);  // rodando ou com resultado esperando

  return (
    <div className="editor">
      <header className="topo">
        <a className="voltar" href="#/" aria-label="Voltar aos projetos">←</a>
        <h1 onDoubleClick={renomear} title="Clique duas vezes para renomear">{projeto.nome}</h1>
        <nav className="abas">
          {abas.map(([k, rotulo]) => (
            <a key={k} href={`#/p/${id}/${k}`} className={`${aba === k ? 'ativa' : ''}${abaOcupada(k) ? ' ocupada' : ''}`}>
              {abaOcupada(k) && <span className="orbe" title="Em andamento" aria-label="(em andamento)" />}
              {rotulo}
              {k === 'roteiro' && roteiroSujo && <span className="ponto" title="Alterações não salvas" />}
              {k === 'plano' && (planoSujo || desatualizado) && <span className="ponto" title={planoSujo ? 'Alterações não salvas' : 'O roteiro mudou depois deste plano'} />}
            </a>
          ))}
        </nav>
      </header>
      <FaixaIA idProjeto={id} />
      {rascunho && (
        <div className="faixa-rascunho" role="status">
          <span>Há alterações do plano que não foram salvas, de {new Date(rascunho.salvoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</span>
          <button className="primario" onClick={() => { setPlano(rascunho.plano); setPlanoSujo(true); setRascunho(null); }}>Recuperar</button>
          <button className="fantasma" onClick={() => { setRascunho(null); api.descartarRascunho(id).catch(() => {}); }}>Descartar</button>
        </div>
      )}
      <main className="conteudo">
        {aba === 'roteiro' && <AbaRoteiro texto={roteiro} onTexto={setRoteiro} sujo={roteiroSujo} onSalvar={salvarRoteiro} />}
        {aba === 'elenco' && <AbaElenco id={id} plano={plano} />}
        {aba === 'plano' && (
          <AbaPlano
            id={id}
            roteiro={roteiro}
            plano={plano}
            desatualizado={desatualizado}
            sujo={planoSujo}
            onAlterar={p => { setPlano(p); setPlanoSujo(true); }}
            onSalvar={salvarPlano}
            roteiroSujo={roteiroSujo}
            onSalvarRoteiro={salvarRoteiro}
          />
        )}
        {aba === 'som' && (
          <AbaSom id={id} plano={plano} sujo={planoSujo} onAlterar={p => { setPlano(p); setPlanoSujo(true); }} onSalvar={salvarPlano} />
        )}
        {aba === 'assistir' && <AbaAssistir id={id} plano={plano} />}
        {aba === 'video' && <AbaVideo id={id} plano={plano} planoSujo={planoSujo} />}
      </main>
    </div>
  );
}
