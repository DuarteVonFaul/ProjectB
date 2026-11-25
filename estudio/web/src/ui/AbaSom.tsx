import { Fragment, useEffect, useRef, useState } from 'react';
import { aplicarSomNaCena, CATALOGO_SONS, descreverPasso, ehPassoDeSom, NOMES_FAIXAS, nomeDoSom, temSomProprio } from '../core/som';
import type { CenaPlano, Faixa, Mixagem, Passo, Plano, Som } from '../core/tipos';
import { pararPrevia, tocarPrevia } from '../player/audio';
import { api } from './api';
import { useDirecao } from './Direcao';
import { SeloIA, tarefaNaCena, useTarefas } from './Tarefas';

type PassoSom = Extract<Passo, { tipo: 'musica' | 'musicaAjuste' | 'som' }>;
type Arquivo = { src: string; nome: string; bytes?: number; categoria?: string };

const ICONE: Partial<Record<Passo['tipo'], string>> = {
  narrar: '🗨', pausa: '⏸', mostrar: '🖼', abrirLivro: '📖', virarPagina: '📖', rasgarPagina: '📖', surgirDasCinzas: '📖',
  fecharLivro: '📕', queimarPaginas: '🔥', efeito: '✨', camera: '🎥', tremor: '〰', titulo: '🅣', escurecer: '◼',
};

/** Prévia: um botão que toca/para um som ou faixa (só um por vez). */
function usePrevia() {
  const [tocando, setTocando] = useState('');
  const to = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { pararPrevia(); clearTimeout(to.current); }, []);
  return {
    tocando,
    alternar(chave: string, alvo: Parameters<typeof tocarPrevia>[0], segundos = 7) {
      clearTimeout(to.current);
      if (tocando === chave) {
        pararPrevia();
        return setTocando('');
      }
      tocarPrevia(alvo, segundos);
      setTocando(chave);
      to.current = setTimeout(() => setTocando(''), segundos * 1000);
    },
  };
}
type Previa = ReturnType<typeof usePrevia>;

function BotaoOuvir({ previa, chave, alvo, segundos }: { previa: Previa; chave: string; alvo: Parameters<typeof tocarPrevia>[0]; segundos?: number }) {
  const ativo = previa.tocando === chave;
  return (
    <button className={`icone ouvir${ativo ? ' ativo' : ''}`} onClick={() => previa.alternar(chave, alvo, segundos)} aria-label={ativo ? 'Parar' : 'Ouvir'} title={ativo ? 'Parar' : 'Ouvir'}>
      {ativo ? '■' : '▶'}
    </button>
  );
}

// ---------- editor de um passo de som ----------

type Tipo = 'musica' | 'musicaParar' | 'musicaAjuste' | 'som' | 'somParar' | 'arquivo';
const tipoDe = (p: PassoSom): Tipo =>
  p.tipo === 'musica' ? (p.acao === 'parar' ? 'musicaParar' : 'musica') : p.tipo === 'musicaAjuste' ? 'musicaAjuste' : p.acao === 'parar' ? 'somParar' : p.src ? 'arquivo' : 'som';

function converter(t: Tipo, p: PassoSom, arquivos: Arquivo[]): PassoSom {
  const faixa: Faixa = 'faixa' in p ? p.faixa : 'calma';
  switch (t) {
    case 'musica': return { tipo: 'musica', faixa, acao: 'tocar', fade: 2 };
    case 'musicaParar': return { tipo: 'musica', faixa, acao: 'parar', fade: 2 };
    case 'musicaAjuste': return { tipo: 'musicaAjuste', faixa, volume: 0.5, duracao: 1.5 };
    case 'som': return { tipo: 'som', som: 'impacto' };
    case 'somParar':
      if (p.tipo === 'som' && (p.src || CATALOGO_SONS.some(s => s.ambiente && s.som === p.som))) return { tipo: 'som', som: p.som, src: p.src, nome: p.nome, acao: 'parar', fade: 1.5 };
      return { tipo: 'som', som: 'vento', acao: 'parar', fade: 1.5 };
    case 'arquivo': return arquivos[0] ? { tipo: 'som', src: arquivos[0].src, nome: arquivos[0].nome } : { tipo: 'som', som: 'impacto' };
  }
}

const Volume = ({ valor, onMudar, rotulo = 'Volume' }: { valor?: number; onMudar: (v: number) => void; rotulo?: string }) => (
  <label className="campo">{rotulo}
    <input type="range" min={0} max={2} step={0.05} value={valor ?? 1} onChange={e => onMudar(Number(e.target.value))} />
    <span className="sutil num">{Math.round((valor ?? 1) * 100)}%</span>
  </label>
);

export function EditorSom({ passo: p, onMudar, arquivos, previa, chave }: { passo: PassoSom; onMudar: (p: PassoSom) => void; arquivos: Arquivo[]; previa?: Previa; chave: string }) {
  const tipo = tipoDe(p);
  return (
    <span className="editor-som">
      <select value={tipo} onChange={e => onMudar(converter(e.target.value as Tipo, p, arquivos))} aria-label="Tipo de som">
        <option value="musica">Tocar música</option>
        <option value="musicaParar">Parar música</option>
        <option value="musicaAjuste">Ajustar música</option>
        <option value="som">Efeito sonoro</option>
        <option value="somParar">Parar som de ambiente</option>
        <option value="arquivo" disabled={!arquivos.length}>Som gravado</option>
      </select>

      {p.tipo !== 'som' && (
        <select value={p.faixa} onChange={e => onMudar({ ...p, faixa: e.target.value as Faixa })} aria-label="Faixa">
          {NOMES_FAIXAS.map(([f, r]) => <option key={f} value={f}>{r}</option>)}
        </select>
      )}
      {p.tipo === 'musica' && p.acao === 'tocar' && <Volume valor={p.volume} onMudar={v => onMudar({ ...p, volume: v })} />}
      {p.tipo === 'musica' && (
        <label className="campo">{p.acao === 'tocar' ? 'entrada' : 'saída'}
          <input type="number" min={0} max={12} step={0.5} value={p.fade ?? 2} onChange={e => onMudar({ ...p, fade: Number(e.target.value) })} /> s
        </label>
      )}
      {p.tipo === 'musica' && p.acao === 'tocar' && previa && <BotaoOuvir previa={previa} chave={chave} alvo={{ faixa: p.faixa, volume: p.volume }} />}

      {p.tipo === 'musicaAjuste' && (
        <>
          <Volume valor={p.volume} onMudar={v => onMudar({ ...p, volume: v })} rotulo="Volume para" />
          <label className="campo">Intensidade
            <input type="range" min={0.5} max={2.2} step={0.1} value={p.intensidade ?? 1} onChange={e => onMudar({ ...p, intensidade: Number(e.target.value) })} />
            <span className="sutil num">{(p.intensidade ?? 1).toFixed(1)}</span>
          </label>
          <label className="campo">em <input type="number" min={0} max={12} step={0.5} value={p.duracao ?? 1.5} onChange={e => onMudar({ ...p, duracao: Number(e.target.value) })} /> s</label>
        </>
      )}

      {p.tipo === 'som' && tipo !== 'arquivo' && !(tipo === 'somParar' && p.src) && (
        <select value={p.som ?? ''} onChange={e => onMudar({ ...p, som: e.target.value as Som, src: undefined, nome: undefined })} aria-label="Som">
          {tipo === 'somParar' ? (
            CATALOGO_SONS.filter(s => s.ambiente).map(s => <option key={s.som} value={s.som}>{s.nome}</option>)
          ) : (
            <>
              <optgroup label="Uma vez">{CATALOGO_SONS.filter(s => !s.ambiente).map(s => <option key={s.som} value={s.som}>{s.nome}</option>)}</optgroup>
              <optgroup label="Ambiente (até parar)">{CATALOGO_SONS.filter(s => s.ambiente).map(s => <option key={s.som} value={s.som}>{s.nome}</option>)}</optgroup>
            </>
          )}
        </select>
      )}
      {p.tipo === 'som' && (tipo === 'arquivo' || (tipo === 'somParar' && p.src)) && (
        <select value={p.src} onChange={e => { const a = arquivos.find(x => x.src === e.target.value); onMudar({ ...p, src: e.target.value, nome: a?.nome }); }} aria-label="Arquivo de som">
          {!arquivos.some(a => a.src === p.src) && <option value={p.src}>{p.nome ?? p.src}</option>}
          {[...new Set(arquivos.map(a => a.categoria ?? ''))].map(cat => (
            <optgroup key={cat} label={cat || 'Seus sons'}>
              {arquivos.filter(a => (a.categoria ?? '') === cat).map(a => <option key={a.src} value={a.src}>{a.nome}</option>)}
            </optgroup>
          ))}
        </select>
      )}
      {p.tipo === 'som' && tipo !== 'somParar' && (
        <>
          <Volume valor={p.volume} onMudar={v => onMudar({ ...p, volume: v })} />
          {tipo === 'arquivo' && (
            <>
              <label className="campo"><input type="checkbox" checked={!!p.loop} onChange={e => onMudar({ ...p, loop: e.target.checked || undefined })} /> repetir até parar</label>
              <label className="campo"><input type="checkbox" checked={p.canal === 'musica'} onChange={e => onMudar({ ...p, canal: e.target.checked ? 'musica' : undefined })} /> é música</label>
            </>
          )}
          {tipo === 'som' && CATALOGO_SONS.find(s => s.som === p.som)?.ambiente && <span className="sutil">toca até “Parar som de ambiente”</span>}
          {previa && <BotaoOuvir previa={previa} chave={chave} alvo={p} segundos={p.loop || CATALOGO_SONS.find(s => s.som === p.som)?.ambiente ? 7 : 5} />}
        </>
      )}
      {p.tipo === 'som' && tipo === 'somParar' && (
        <label className="campo">saída <input type="number" min={0} max={12} step={0.5} value={p.fade ?? 1.5} onChange={e => onMudar({ ...p, fade: Number(e.target.value) })} /> s</label>
      )}
    </span>
  );
}

// ---------- a aba ----------

export function AbaSom({ id, plano, sujo, onAlterar, onSalvar }: { id: string; plano: Plano | null; sujo: boolean; onAlterar: (p: Plano) => void; onSalvar: (p: Plano) => Promise<void> }) {
  const previa = usePrevia();
  const [projeto, setProjeto] = useState<Arquivo[]>([]);
  const [biblioteca, setBiblioteca] = useState<Arquivo[]>([]);
  const arquivos = [...projeto, ...biblioteca];
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [refazendo, setRefazendo] = useState<{ cena: number; instrucoes: string } | null>(null);
  const [refeitas, setRefeitas] = useState<Set<number>>(new Set());
  /** Som escolhido na biblioteca para colocar nas cenas (clicando em "＋ colocar aqui"). */
  const [escolhido, setEscolhido] = useState<{ chave: string; nome: string; passo: PassoSom } | null>(null);
  useEffect(() => {
    if (!escolhido) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setEscolhido(null); };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [escolhido]);
  const planoAtual = useRef(plano);
  planoAtual.current = plano;
  const { ativas, recarregar } = useTarefas();

  const carregarArquivos = () => api.sons(id).then(setProjeto).catch(() => {});
  useEffect(() => {
    carregarArquivos();
    api.biblioteca().then(setBiblioteca).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const trilha = useDirecao(id, t => {
    const atual = planoAtual.current;
    if (!t.cenas?.length || !atual) return;
    const novas = new Map(t.cenas.map(c => [c.numero, c]));
    const aplicadas: number[] = [], conflitos: number[] = [];
    const cenas = atual.cenas.map(c => {
      const nova = novas.get(c.numero);
      if (!nova) return c;
      // Só o som muda: falas e imagens editadas enquanto o Claude compunha ficam como estão.
      const r = aplicarSomNaCena(c, nova);
      if (!r) { conflitos.push(c.numero); return c; }
      aplicadas.push(c.numero);
      return r;
    });
    if (aplicadas.length) onAlterar({ ...atual, cenas });
    setRefeitas(new Set(aplicadas));
    if (conflitos.length) setErro(`A trilha ${conflitos.length === 1 ? 'da cena' : 'das cenas'} ${conflitos.join(', ')} não foi aplicada: passos foram incluídos ou removidos ${conflitos.length === 1 ? 'nela' : 'nelas'} enquanto o Claude compunha. Peça de novo.`);
  });
  // Volta a acompanhar a trilha se ela já estava sendo composta (ex.: depois de trocar de aba).
  useEffect(() => {
    const t = ativas.find(x => x.tipo === 'som');
    if (t && !trilha.rodando) trilha.retomar(t);
  }, [ativas]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (trilha.tarefa) recarregar(); }, [trilha.tarefa?.id, trilha.tarefa?.estado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!plano) return <div className="vazio"><h2>Ainda não há plano</h2><p>Gere o plano de animação primeiro: a trilha é montada sobre as cenas dele.</p></div>;

  const mix = plano.mixagem ?? {};
  const mudarMix = (m: Partial<Mixagem>) => onAlterar({ ...plano, mixagem: { ...mix, ...m } });

  const alterarCena = (ci: number, passos: Passo[]) => onAlterar({ ...plano, cenas: plano.cenas.map((c, i) => (i === ci ? { ...c, passos } : c)) });
  const mudarPasso = (ci: number, pi: number, novo: Passo | null, mover = 0) => {
    const passos = [...plano.cenas[ci].passos];
    if (novo === null) passos.splice(pi, 1);
    else passos[pi] = novo;
    if (mover && pi + mover >= 0 && pi + mover < passos.length) [passos[pi], passos[pi + mover]] = [passos[pi + mover], passos[pi]];
    alterarCena(ci, passos);
  };
  const inserir = (ci: number, depoisDe: number, p: Passo) => {
    const passos = [...plano.cenas[ci].passos];
    passos.splice(depoisDe + 1, 0, p);
    alterarCena(ci, passos);
  };
  const colocar = (ci: number, depoisDe: number) => {
    if (!escolhido) return;
    inserir(ci, depoisDe, { ...escolhido.passo });
    setAviso(`“${escolhido.nome}” colocado na cena ${plano.cenas[ci].numero}. Salve o plano.`);
    setTimeout(() => setAviso(''), 3500);
  };
  const Chip = ({ chave, nome, passo, previaAlvo, segundos, classe = '', titulo }: { chave: string; nome: string; passo: PassoSom; previaAlvo: Parameters<typeof tocarPrevia>[0]; segundos: number; classe?: string; titulo?: string }) => {
    const ativo = escolhido?.chave === chave;
    return (
      <span className={`bib-item ${classe}${ativo ? ' escolhido' : ''}`} title={titulo}>
        <BotaoOuvir previa={previa} chave={`bib-${chave}`} alvo={previaAlvo} segundos={segundos} />
        <button className="bib-nome" onClick={() => setEscolhido(ativo ? null : { chave, nome, passo })} title="Escolher para colocar nas cenas" aria-pressed={ativo}>
          {nome}
          <span className="bib-mais" aria-hidden>{ativo ? '✓' : '＋'}</span>
        </button>
      </span>
    );
  };

  function compor(cenas?: number[], instr = instrucoes) {
    setErro('');
    setRefazendo(null);
    if (!cenas && plano!.cenas.some(c => c.passos.some(ehPassoDeSom)) && !confirm('O Claude vai refazer a música e os efeitos sonoros de todas as cenas (os passos visuais e as falas não mudam). Continuar?')) return;
    trilha.iniciarCom(() => api.sonorizar(id, { plano: plano!, cenas, instrucoes: instr }), cenas);
  }

  async function enviar(lista: FileList | null) {
    if (!lista?.length) return;
    setEnviando(true);
    setErro('');
    try {
      for (const f of Array.from(lista)) await api.enviarArte(id, f);
      await carregarArquivos();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function salvar() {
    try {
      await onSalvar(plano!);
      setRefeitas(new Set());
      setAviso('Plano salvo.');
      setTimeout(() => setAviso(''), 2000);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const contar = (c: CenaPlano) => {
    const musicas = c.passos.filter(p => p.tipo === 'musica' || p.tipo === 'musicaAjuste').length;
    const sons = c.passos.filter(p => p.tipo === 'som').length;
    return [musicas && `${musicas} de música`, sons && `${sons} ${sons === 1 ? 'som' : 'sons'}`].filter(Boolean).join(' · ') || 'sem som';
  };

  return (
    <div className="plano aba-som">
      <div className="barra">
        <p className="sutil">Música e efeitos sonoros de cada cena. As mudanças entram no plano: salve para valerem em Assistir e no vídeo.</p>
        <div className="direita">
          {aviso && <span className="ok">{aviso}</span>}
          <button className="primario" onClick={salvar}>{sujo ? 'Salvar plano' : 'Salvo'}</button>
        </div>
      </div>
      {erro && <p className="erro">{erro}</p>}

      <div className="som-topo">
        <section className="painel-claude" aria-label="Trilha com Claude">
          <div className="pc-topo"><h2><span className="estrela" aria-hidden>✦</span> Trilha com Claude</h2></div>
          {!trilha.rodando ? (
            <div className="pc-pedido">
              <textarea rows={2} value={instrucoes} onChange={e => setInstrucoes(e.target.value)} placeholder="Pedido opcional, ex.: mais silêncio nas falas, trovões na tempestade, música épica só no final" aria-label="Pedido para a trilha" />
              <button className="primario" onClick={() => compor()}>Compor a trilha de todas as cenas</button>
            </div>
          ) : (
            <div className="pc-andamento" role="status">
              <span className="girando" aria-hidden />
              <span>{trilha.tarefa?.etapa}</span>
              <span className="sutil">{trilha.tarefa?.segundos ?? 0}s</span>
              <button className="fantasma" onClick={trilha.cancelar}>Cancelar</button>
            </div>
          )}
          {trilha.erro && <p className="erro">{trilha.erro}</p>}
          {trilha.tarefa?.estado === 'erro' && <p className="erro">{trilha.tarefa.erro}</p>}
          {trilha.tarefa?.estado === 'concluida' && (
            <div className="pc-feito">
              <p className="ok">Trilha pronta em {trilha.tarefa.segundos}s. Ouça as cenas marcadas e salve o plano.</p>
              {trilha.tarefa.avisos.length > 0 && <details><summary>{trilha.tarefa.avisos.length} ponto(s) para conferir</summary><ul>{trilha.tarefa.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
            </div>
          )}
          <p className="sutil pc-nota">O Claude lê as cenas (imagens, falas, efeitos) e decide quando a música entra, muda e para, e onde vão os efeitos sonoros. Não mexe nas falas nem nas imagens.</p>
        </section>

        <section className="cena-plano mesa" aria-label="Mesa de som">
          <h3>Mesa de som</h3>
          <Volume rotulo="Música" valor={mix.musica} onMudar={v => mudarMix({ musica: v })} />
          <Volume rotulo="Efeitos" valor={mix.efeitos} onMudar={v => mudarMix({ efeitos: v })} />
          <Volume rotulo="Vozes" valor={mix.voz} onMudar={v => mudarMix({ voz: v })} />
          <p className="sutil">Volume geral de cada grupo, em Assistir e no vídeo.</p>
        </section>
      </div>

      <section className="cena-plano biblioteca" aria-label="Biblioteca de sons">
        <h3>Biblioteca</h3>
        <div className="bib-grupo">
          <span className="bib-titulo">Músicas</span>
          {NOMES_FAIXAS.map(([f, nome]) => (
            <Chip key={f} chave={f} nome={nome} passo={{ tipo: 'musica', faixa: f, acao: 'tocar', fade: 2 }} previaAlvo={{ faixa: f }} segundos={10} />
          ))}
        </div>
        <div className="bib-grupo">
          <span className="bib-titulo">Efeitos sonoros</span>
          {CATALOGO_SONS.map(s => (
            <Chip key={s.som} chave={s.som} nome={s.nome} passo={{ tipo: 'som', som: s.som }} previaAlvo={{ tipo: 'som', som: s.som }} segundos={s.ambiente ? 7 : 5} classe={s.ambiente ? 'ambiente' : ''} titulo={s.ambiente ? 'Ambiente: fica tocando até parar' : undefined} />
          ))}
        </div>
        {[...new Set(biblioteca.map(b => b.categoria ?? ''))].map(cat => (
          <div key={cat} className="bib-grupo">
            <span className="bib-titulo" title="Gravações CC0 (domínio público) da pasta estudio/sons">{cat}</span>
            {biblioteca.filter(b => (b.categoria ?? '') === cat).map(a => (
              <Chip key={a.src} chave={a.src} nome={a.nome} passo={{ tipo: 'som', src: a.src, nome: a.nome }} previaAlvo={{ tipo: 'som', src: a.src }} segundos={a.nome.match(/trovao|chuva|trompas|terror/) ? 60 : 6} classe="gravado" />
            ))}
          </div>
        ))}
        <div className="bib-grupo">
          <span className="bib-titulo">Seus sons</span>
          {projeto.map(a => (
            <Chip key={a.src} chave={a.src} nome={a.nome} passo={{ tipo: 'som', src: a.src, nome: a.nome }} previaAlvo={{ tipo: 'som', src: a.src }} segundos={60} />
          ))}
          <label className="botao enviar-som">
            {enviando ? 'Enviando…' : '+ Enviar MP3/WAV'}
            <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a" multiple hidden onChange={e => { enviar(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        <p className="dica-colocar">Para pôr um som numa cena: clique no <b>nome</b> dele (▶ só ouve) e depois em <b>＋ colocar aqui</b> no ponto da cena onde ele deve tocar.</p>
        <p className="sutil">As gravações por categoria são CC0 (domínio público, uso comercial livre; créditos em estudio/sons/CREDITOS.md) e valem para todos os projetos. Seus sons enviados ficam em assets/ deste projeto. Todos aparecem em “Som gravado”; o Claude também pode usá-los ao compor a trilha.</p>
      </section>

      {escolhido && (
        <div className="barra-colocar" role="status">
          <span>Colocando <b>“{escolhido.nome}”</b>: clique em <b>＋ colocar aqui</b> no ponto da cena onde ele deve tocar (pode pôr em várias).</span>
          {aviso && <span className="ok">{aviso}</span>}
          <button className="primario" onClick={() => setEscolhido(null)}>Concluir</button>
        </div>
      )}

      {plano.cenas.map((c, ci) => {
        const ia = tarefaNaCena(ativas, c.numero, ['som']);
        return (
          <section key={c.numero} className={`cena-plano cena-som${refeitas.has(c.numero) ? ' refeita' : ''}${ia ? ' trabalhando' : ''}`}>
            <div className="cena-topo">
              <h3>Cena {String(c.numero).padStart(2, '0')}</h3>
              <span className="sutil">{contar(c)}</span>
              {ia && <SeloIA tarefa={ia} />}
              {!ia && refeitas.has(c.numero) && <span className="selo-ia">Trilha do Claude · revise</span>}
              <span className="direita">
                <button className="fantasma" onClick={() => { try { sessionStorage.setItem(`estudio-cena-${id}`, String(c.numero)); } catch { /* sem armazenamento */ } location.hash = `#/p/${id}/assistir`; }}>▶ Assistir a cena</button>
                <button className="fantasma" disabled={trilha.rodando} onClick={() => setRefazendo(r => (r?.cena === c.numero ? null : { cena: c.numero, instrucoes: '' }))}>✦ Som com Claude</button>
              </span>
            </div>
            {refazendo?.cena === c.numero && (
              <form className="refazer" onSubmit={e => { e.preventDefault(); compor([c.numero], refazendo.instrucoes); }}>
                <input autoFocus value={refazendo.instrucoes} onChange={e => setRefazendo({ cena: c.numero, instrucoes: e.target.value })} placeholder="O que quer no som desta cena? ex.: chuva o tempo todo, trovão quando ela grita" aria-label={`Pedido para o som da cena ${c.numero}`} />
                <button className="primario" type="submit">Compor</button>
              </form>
            )}
            <ol className={`linha-tempo${escolhido ? ' colocando' : ''}`}>
              {escolhido && (
                <li className="encaixe"><button onClick={() => colocar(ci, -1)}>＋ colocar “{escolhido.nome}” no início da cena</button></li>
              )}
              {c.passos.map((p, pi) => (
                <Fragment key={pi}>
                <li className={ehPassoDeSom(p) ? `som-passo ${p.tipo}` : 'som-contexto'}>
                  {ehPassoDeSom(p) ? (
                    <>
                      <span className="marca-som" aria-hidden>{p.tipo === 'som' ? '🔊' : '♪'}</span>
                      <EditorSom passo={p as PassoSom} onMudar={n => mudarPasso(ci, pi, n)} arquivos={arquivos} previa={previa} chave={`c${c.numero}-${pi}`} />
                      <span className="ferramentas">
                        <button className="icone" onClick={() => mudarPasso(ci, pi, p, -1)} aria-label="Mover para cima" title="Mais cedo">↑</button>
                        <button className="icone" onClick={() => mudarPasso(ci, pi, p, 1)} aria-label="Mover para baixo" title="Mais tarde">↓</button>
                        <button className="icone" onClick={() => mudarPasso(ci, pi, null)} aria-label="Remover">×</button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="marca-som" aria-hidden>{ICONE[p.tipo] ?? '•'}</span>
                      <span className="contexto-texto">{descreverPasso(p)}</span>
                      {temSomProprio(p) && <span className="tag-som" title="Este passo já toca um som do estúdio">🔊 som próprio</span>}
                      {!escolhido && <button className="icone mais" onClick={() => inserir(ci, pi, { tipo: 'som', som: 'impacto' })} title="Adicionar um som depois deste passo (depois escolha qual)" aria-label="Adicionar som aqui">＋ som</button>}
                    </>
                  )}
                </li>
                {escolhido && (
                  <li className="encaixe"><button onClick={() => colocar(ci, pi)}>＋ colocar “{escolhido.nome}” aqui</button></li>
                )}
                </Fragment>
              ))}
            </ol>
            <div className="linha som-adicionar">
              <button className="fantasma" onClick={() => inserir(ci, -1, { tipo: 'musica', faixa: 'calma', acao: 'tocar', fade: 2 })}>＋ Música no início</button>
              <button className="fantasma" onClick={() => inserir(ci, c.passos.length - 1, { tipo: 'som', som: 'impacto' })}>＋ Som no fim</button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export { nomeDoSom };
