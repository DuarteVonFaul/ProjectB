import { useEffect, useState } from 'react';
import { ESTILO_PADRAO, type Elenco, type Plano } from '../core/tipos';
import { api } from './api';
import { useTarefaArte } from './Arte';
import { useTarefas } from './Tarefas';
import { BotaoCopiar, useStatusImagens, ZonaImagem } from './Imagens';
import { montarPromptFolha } from '../core/promptImagem';

export function AbaElenco({ id, plano }: { id: string; plano: Plano | null }) {
  const [elenco, setElenco] = useState<Elenco | null>(null);
  const [salvo, setSalvo] = useState('');
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState(-1);
  const gemini = useStatusImagens();
  const ctl = useTarefaArte(t => {
    if (t.elenco) {
      setElenco(t.elenco);
      setAviso('O Claude montou o elenco. Revise e salve.');
    }
  });

  useEffect(() => {
    api.elenco(id).then(e => { setElenco(e); setSalvo(JSON.stringify(e)); }).catch(e => setErro(e.message));
  }, [id]);
  // Elenco montado (ou sendo montado) enquanto você estava em outra aba.
  const tarefas = useTarefas();
  useEffect(() => {
    const t = tarefas.ativas.find(x => x.tipo === 'elenco');
    if (t && !ctl.rodando) ctl.retomar(t);
  }, [tarefas.ativas]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { tarefas.recarregar(); }, [ctl.tarefa?.id, ctl.tarefa?.estado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!elenco) return <div className="plano"><p className="sutil">{erro || 'Carregando…'}</p></div>;
  const sujo = JSON.stringify(elenco) !== salvo;
  const mudar = (i: number, campo: 'nome' | 'descricao', v: string) =>
    setElenco({ ...elenco, personagens: elenco.personagens.map((p, j) => (j === i ? { ...p, [campo]: v } : p)) });
  const mudarRef = (i: number, src: string | undefined) =>
    setElenco(e => (e ? { ...e, personagens: e.personagens.map((p, j) => (j === i ? { ...p, referencia: src } : p)) } : e));

  async function enviarRef(i: number, f: File) {
    setGerando(i);
    setErro('');
    try {
      mudarRef(i, (await api.enviarArte(id, f)).src);
      setAviso('Referência adicionada. Salve o elenco.');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(-1);
    }
  }

  async function gerarFolha(i: number) {
    setGerando(i);
    setErro('');
    try {
      mudarRef(i, (await api.gerarReferencia(id, elenco!.personagens[i], elenco!.estilo)).src);
      setAviso('Folha gerada. Revise e salve o elenco.');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(-1);
    }
  }

  async function salvar() {
    try {
      const e = await api.salvarElenco(id, elenco!);
      setElenco(e);
      setSalvo(JSON.stringify(e));
      setAviso('Elenco salvo.');
      setErro('');
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="plano elenco">
      <div className="barra">
        <p className="sutil">O estilo e a aparência de cada personagem entram em todos os pedidos de ilustração, para as páginas ficarem consistentes.</p>
        <div className="direita">
          {aviso && <span className="ok">{aviso}</span>}
          <button className="primario" onClick={salvar} disabled={!sujo}>{sujo ? 'Salvar elenco' : 'Salvo'}</button>
        </div>
      </div>
      {erro && <p className="erro">{erro}</p>}

      <section className="painel-claude">
        <div className="pc-topo"><h2><span className="estrela" aria-hidden>✦</span> Montar com Claude</h2></div>
        {ctl.rodando ? (
          <div className="pc-andamento" role="status">
            <span className="girando" aria-hidden /><span>{ctl.tarefa?.etapa}</span><span className="sutil">{ctl.tarefa?.segundos ?? 0}s</span>
            <button className="fantasma" onClick={ctl.cancelar}>Cancelar</button>
          </div>
        ) : (
          <div className="pc-pedido">
            <p className="sutil">O Claude lê o roteiro e as descrições do plano e propõe o estilo visual e a aparência fixa de cada personagem.{elenco.personagens.length ? ' O que estiver aqui será substituído (só vale depois de salvar).' : ''}</p>
            <button className="primario" onClick={() => ctl.iniciar(() => api.gerarElenco(id, plano))}>{elenco.personagens.length ? 'Montar de novo' : 'Montar elenco e estilo'}</button>
          </div>
        )}
        {ctl.erro && <p className="erro">{ctl.erro}</p>}
        {ctl.tarefa?.estado === 'erro' && <p className="erro">{ctl.tarefa.erro}</p>}
      </section>

      <section className="cena-plano">
        <h3>Estilo visual</h3>
        <textarea rows={3} value={elenco.estilo} placeholder={ESTILO_PADRAO} onChange={e => setElenco({ ...elenco, estilo: e.target.value })} aria-label="Estilo visual" />
      </section>

      <section className="cena-plano">
        <div className="cena-topo">
          <h3>Personagens</h3>
          <button className="fantasma direita" onClick={() => setElenco({ ...elenco, personagens: [...elenco.personagens, { nome: '', descricao: '' }] })}>+ Adicionar</button>
        </div>
        {!elenco.personagens.length && <p className="sutil">Nenhum personagem ainda.</p>}
        {elenco.personagens.map((p, i) => (
          <div key={i} className="personagem">
            <input value={p.nome} placeholder="Nome" onChange={e => mudar(i, 'nome', e.target.value)} aria-label="Nome do personagem" />
            <div className="personagem-desc">
              <textarea rows={3} value={p.descricao} placeholder="Aparência fixa: idade, corpo, rosto, cabelo, roupa, cores, marcas" onChange={e => mudar(i, 'descricao', e.target.value)} aria-label={`Aparência de ${p.nome || 'personagem'}`} />
              <div className="linha">
                <span className="rotulo">Referência visual</span>
                <BotaoCopiar rotulo="Copiar prompt da folha" texto={() => montarPromptFolha(p, elenco.estilo)} />
                <button className="fantasma" disabled={!gemini?.configurado || gerando === i || !p.nome || !p.descricao} title={gemini?.configurado ? '' : gemini?.mensagem} onClick={() => gerarFolha(i)}>
                  {gerando === i ? 'Gerando…' : `✦ ${p.referencia ? 'Refazer' : 'Gerar'} folha com Gemini`}
                </button>
                {p.referencia && <button className="icone" onClick={() => mudarRef(i, undefined)} aria-label={`Remover referência de ${p.nome}`}>Remover</button>}
              </div>
            </div>
            <ZonaImagem onArquivo={f => enviarRef(i, f)} ocupado={gerando === i} rotulo={p.referencia ? 'Trocar referência' : 'Arraste, cole ou escolha a referência'}>
              {p.referencia && <img src={p.referencia} alt={`Referência de ${p.nome}`} className="previa-ref" />}
            </ZonaImagem>
            <button className="icone" onClick={() => setElenco({ ...elenco, personagens: elenco.personagens.filter((_, j) => j !== i) })} aria-label={`Remover ${p.nome || 'personagem'}`}>×</button>
          </div>
        ))}
        {elenco.personagens.length > 0 && (
          <p className="sutil">
            A referência vai junto em cada imagem gerada pelo Gemini em que o personagem aparece (até 4 por imagem). No modo manual, anexe-a no app do Gemini ao colar o prompt.
          </p>
        )}
      </section>
    </div>
  );
}
