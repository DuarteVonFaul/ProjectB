import { useEffect, useMemo, useRef, useState } from 'react';
import type { Plano } from '../core/tipos';
import { CATALOGO_VOZES, falasDoPlano, personagensDoPlano, VOZES_PADRAO, type ConfigVozes, type IdVoz, type InfoVoz, type ManifestoNarracao, type VozEscolhida } from '../core/vozes';

const GRUPOS: [string, (v: InfoVoz) => boolean][] = [
  ['Português · femininas', v => !v.experimental && v.genero === 'feminina'],
  ['Português · masculinas', v => !v.experimental && v.genero === 'masculina'],
  ['Experimentais · femininas', v => v.experimental && v.genero === 'feminina'],
  ['Experimentais · masculinas', v => v.experimental && v.genero === 'masculina'],
];
import { api } from './api';
import { useTarefaArte } from './Arte';
import { useTarefas } from './Tarefas';

const kb = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

export function AbaVideo({ id, plano, planoSujo }: { id: string; plano: Plano | null; planoSujo: boolean }) {
  const [cfg, setCfg] = useState<ConfigVozes | null>(null);
  const [cfgSalva, setCfgSalva] = useState('');
  const [manifesto, setManifesto] = useState<ManifestoNarracao>({ itens: {} });
  const [piper, setPiper] = useState<{ instalado: boolean; mensagem: string; vozes: string[] } | null>(null);
  const [mostrarExperimentais, setMostrarExperimentais] = useState(false);
  const [exportacoes, setExportacoes] = useState<{ nome: string; src: string; bytes: number; data: string }[]>([]);
  const [erro, setErro] = useState('');
  const [ouvindo, setOuvindo] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const recarregar = () => {
    api.manifestoNarracao(id).then(setManifesto).catch(() => {});
    api.exportacoes(id).then(setExportacoes).catch(() => {});
  };
  useEffect(() => {
    api.vozes(id).then(c => { setCfg(c); setCfgSalva(JSON.stringify(c)); }).catch(e => setErro(e.message));
    api.statusPiper().then(setPiper).catch(() => {});
    recarregar();
  }, [id]);

  const narracao = useTarefaArte(() => {});
  const exportacao = useTarefaArte(() => {});
  useEffect(() => { if (narracao.tarefa && narracao.tarefa.estado !== 'rodando') recarregar(); }, [narracao.tarefa?.estado]);
  // Narração ou exportação que continuou rodando enquanto você estava em outra aba.
  const tarefas = useTarefas();
  useEffect(() => {
    const n = tarefas.ativas.find(t => t.tipo === 'narracao');
    if (n && !narracao.rodando) narracao.retomar(n);
    const x = tarefas.ativas.find(t => t.tipo === 'exportacao');
    if (x && !exportacao.rodando) exportacao.retomar(x);
  }, [tarefas.ativas]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { tarefas.recarregar(); }, [narracao.tarefa?.id, narracao.tarefa?.estado, exportacao.tarefa?.id, exportacao.tarefa?.estado]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (exportacao.tarefa && exportacao.tarefa.estado !== 'rodando') recarregar(); }, [exportacao.tarefa?.estado]);

  const personagens = useMemo(() => (plano ? personagensDoPlano(plano) : []), [plano]);
  const primeiraFala = (quem?: string) => {
    for (const p of plano?.cenas.flatMap(c => c.passos) ?? [])
      if (p.tipo === 'narrar' && (quem ? p.personagem === quem : !p.personagem)) return p.texto;
    return undefined;
  };

  if (!plano) return <div className="vazio"><h2>Ainda não há plano</h2><p>Gere e salve o plano de animação primeiro.</p></div>;
  if (!cfg) return <div className="plano"><p className="sutil">{erro || 'Carregando…'}</p></div>;

  const cfgSuja = JSON.stringify(cfg) !== cfgSalva;
  const falas = falasDoPlano(plano, cfg);
  const prontas = falas.filter(f => manifesto.itens[f.chave]).length;
  const segundos = Math.round(falas.reduce((s, f) => s + (manifesto.itens[f.chave]?.ms ?? 0), 0) / 1000);

  const mudar = (quem: string | null, v: Partial<VozEscolhida>) =>
    setCfg(c => {
      if (!c) return c;
      if (!quem) return { ...c, narrador: { ...c.narrador, ...v } };
      return { ...c, personagens: { ...c.personagens, [quem]: { ...(c.personagens[quem] ?? c.narrador), ...v } } };
    });

  async function ouvir(quem: string | null) {
    const v = quem ? cfg!.personagens[quem] ?? cfg!.narrador : cfg!.narrador;
    setOuvindo(quem ?? '__narrador');
    try {
      const { src } = await api.amostraVoz(v.voz, v.velocidade, primeiraFala(quem ?? undefined), v.tom ?? 0);
      audioRef.current?.pause();
      audioRef.current = new Audio(src);
      await audioRef.current.play();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOuvindo('');
    }
  }

  async function salvarVozes() {
    const c = await api.salvarVozes(id, cfg!);
    setCfg(c);
    setCfgSalva(JSON.stringify(c));
  }

  async function gerar() {
    setErro('');
    if (cfgSuja) await salvarVozes();
    narracao.iniciar(() => api.gerarNarracao(id, plano!));
  }

  const linhaVoz = (quem: string | null, rotulo: string) => {
    const v = quem ? cfg.personagens[quem] ?? cfg.narrador : cfg.narrador;
    return (
      <div className="linha voz-linha" key={quem ?? '__narrador'}>
        <span className="nome">{rotulo}</span>
        <select value={v.voz} onChange={e => mudar(quem, { voz: e.target.value as IdVoz })} aria-label={`Voz de ${rotulo}`}>
          {GRUPOS.map(([titulo, filtro]) => {
            const lista = CATALOGO_VOZES.filter(x => filtro(x) && (!piper || piper.vozes.includes(x.id)) && (mostrarExperimentais || !x.experimental || x.id === v.voz));
            return lista.length ? (
              <optgroup key={titulo} label={titulo}>
                {lista.map(x => <option key={x.id} value={x.id}>{x.nome}{x.experimental ? ` (sotaque ${x.origem})` : ''} · {x.motor === 'piper' ? 'Piper' : 'Kokoro'}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        <label className="campo">Tom
          <input type="range" min={-6} max={6} step={1} value={v.tom ?? 0} onChange={e => mudar(quem, { tom: Number(e.target.value) || undefined })} />
          <span className="sutil">{(v.tom ?? 0) > 0 ? '+' : ''}{v.tom ?? 0}</span>
        </label>
        <label className="campo">Velocidade
          <input type="range" min={0.7} max={1.4} step={0.05} value={v.velocidade} onChange={e => mudar(quem, { velocidade: Number(e.target.value) })} />
          <span className="sutil">{v.velocidade.toFixed(2)}×</span>
        </label>
        <button className="fantasma" disabled={!piper?.instalado || ouvindo !== ''} onClick={() => ouvir(quem)}>
          {ouvindo === (quem ?? '__narrador') ? 'Gerando…' : '▶ Ouvir'}
        </button>
      </div>
    );
  };

  return (
    <div className="plano video">
      {erro && <p className="erro">{erro}</p>}
      {piper && !piper.instalado && <p className="alerta">{piper.mensagem}</p>}

      <section className="cena-plano">
        <div className="cena-topo">
          <h3>Vozes (gratuitas)</h3>
          <button className="fantasma direita" disabled={!cfgSuja} onClick={salvarVozes}>{cfgSuja ? 'Salvar vozes' : 'Vozes salvas'}</button>
        </div>
        <p className="sutil">As vozes (Piper e Kokoro) rodam no seu computador, sem internet e sem custo. Escolha voz, velocidade e tom para o narrador e cada personagem; "Ouvir" toca a primeira fala dele. Tom negativo deixa mais grave; positivo, mais agudo.</p>
        <label className="campo">
          <input type="checkbox" checked={mostrarExperimentais} onChange={e => setMostrarExperimentais(e.target.checked)} /> Mostrar vozes experimentais (de outros idiomas, falando português com sotaque)
        </label>
        {linhaVoz(null, 'Narrador')}
        {personagens.map(p => linhaVoz(p, p))}
      </section>

      <section className="cena-plano">
        <div className="cena-topo">
          <h3>Narração</h3>
          <span className="sutil">{prontas} de {falas.length} falas geradas{segundos ? ` · ${Math.floor(segundos / 60)} min ${segundos % 60} s de fala` : ''}</span>
        </div>
        {narracao.rodando ? (
          <div className="pc-andamento" role="status">
            <span className="girando" aria-hidden /><span>{narracao.tarefa?.etapa}</span>
            <progress max={narracao.tarefa?.total ?? 1} value={narracao.tarefa?.feitos ?? 0} />
            <button className="fantasma" onClick={narracao.cancelar}>Cancelar</button>
          </div>
        ) : (
          <div className="linha">
            <button className="primario" disabled={!piper?.instalado || prontas === falas.length} onClick={gerar}>
              {prontas === falas.length ? 'Narração completa' : `Gerar narração (${falas.length - prontas} falas)`}
            </button>
            <span className="sutil">Só as falas novas ou alteradas são geradas. A aba Assistir passa a usar estas vozes.</span>
          </div>
        )}
        {narracao.erro && <p className="erro">{narracao.erro}</p>}
        {narracao.tarefa?.estado === 'erro' && <p className="erro">{narracao.tarefa.erro}</p>}
        {narracao.tarefa && narracao.tarefa.avisos.length > 0 && (
          <details className="pc-feito"><summary>{narracao.tarefa.avisos.length} fala(s) falharam</summary><ul>{narracao.tarefa.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
        )}
      </section>

      <section className="cena-plano">
        <div className="cena-topo"><h3>Exportar vídeo · Instagram Reels (9:16)</h3></div>
        <p className="sutil">
          Gera um MP4 vertical 1080×1920 com a animação no centro, a cena desfocada como fundo e legendas grandes. A gravação é em tempo real: leva o mesmo tempo que a animação, mais a montagem.
          O vídeo usa o plano <b>salvo</b>.
        </p>
        {planoSujo && <p className="alerta">O plano tem alterações não salvas: o vídeo vai sair com a versão salva.</p>}
        {exportacao.rodando ? (
          <div className="pc-andamento" role="status">
            <span className="girando" aria-hidden /><span>{exportacao.tarefa?.etapa}</span>
            <progress max={exportacao.tarefa?.total ?? 1} value={exportacao.tarefa?.feitos ?? 0} />
            <span className="sutil">{exportacao.tarefa?.segundos ?? 0}s</span>
            <button className="fantasma" onClick={exportacao.cancelar}>Cancelar</button>
          </div>
        ) : (
          <div className="linha">
            <button className="primario" disabled={prontas < falas.length} onClick={() => { setErro(''); exportacao.iniciar(() => api.exportar(id)); }}>
              Exportar Reels (9:16)
            </button>
            {prontas < falas.length && <span className="sutil">Gere a narração primeiro.</span>}
          </div>
        )}
        {exportacao.erro && <p className="erro">{exportacao.erro}</p>}
        {exportacao.tarefa?.estado === 'erro' && <p className="erro">{exportacao.tarefa.erro}</p>}
        {exportacao.tarefa?.estado === 'concluida' && exportacao.tarefa.saida && (
          <div className="video-pronto">
            <video src={exportacao.tarefa.saida} controls />
            <a className="botao primario" href={`${exportacao.tarefa.saida}?baixar=1`}>Baixar MP4</a>
          </div>
        )}
        {exportacoes.length > 0 && (
          <ul className="exportacoes">
            {exportacoes.map(e => (
              <li key={e.nome}>
                <a href={e.src} target="_blank" rel="noreferrer">{e.nome}</a>
                <span className="sutil">{kb(e.bytes)} · {new Date(e.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <a className="botao" href={`${e.src}?baixar=1`}>Baixar</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export const cfgPadrao = VOZES_PADRAO;
