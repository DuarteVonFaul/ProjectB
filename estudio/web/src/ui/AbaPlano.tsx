import { useEffect, useMemo, useRef, useState } from 'react';
import { gerarPlano } from '../core/diretor';
import { lerRoteiro } from '../core/roteiro';
import { ilustracoesDoPasso, livroParaCinema } from '../core/cinema';
import type { Efeito, Elenco, Faixa, Formato, Ilustracao, Movimento, Pagina, Passo, Plano, Transicao, Velocidade } from '../core/tipos';
import { desenharPagina } from '../player/paginas';
import { montarPromptImagem } from '../core/promptImagem';
import { api, type Motor, type Qualidade } from './api';
import { BotaoCopiar, useStatusImagens, ZonaImagem } from './Imagens';
import { aplicarIlustracoes, ilustracoesDoPlano, itemDe, PainelIlustracoes, temArte, useTarefaArte } from './Arte';
import { PainelClaude, useDirecao } from './Direcao';
import { hashTexto } from './EditorProjeto';
import { EditorSom } from './AbaSom';
import { SeloIA, tarefaNaCena, useTarefas } from './Tarefas';

const FAIXAS: [Faixa, string][] = [['calma', 'Calma / fantasia'], ['guerra', 'Guerra'], ['esperanca', 'Esperança'], ['agonia', 'Agonia'], ['perseguicao', 'Perseguição'], ['suave', 'Suave'], ['fogo', 'Fogo (ambiente)']];
const EFEITOS: [Efeito, string][] = [['sangue', 'Respingo de sangue'], ['fogo', 'Fogo'], ['apagarFogo', 'Apagar fogo'], ['brilho', 'Brilhos'], ['focar', 'Tirar desfoque'], ['perfurar', 'Som de perfuração'], ['clarao', 'Clarão (explosão)'], ['fim', 'Mostrar "Fim"']];
const VELS: [Velocidade, string][] = [['lenta', 'Lenta'], ['normal', 'Normal'], ['rapida', 'Rápida'], ['relampago', 'Relâmpago']];
const NOMES: Record<Passo['tipo'], string> = {
  abrirLivro: 'Abrir o livro', fecharLivro: 'Fechar o livro', virarPagina: 'Virar página', rasgarPagina: 'Rasgar página',
  queimarPaginas: 'Queimar páginas', surgirDasCinzas: 'Página surge das cinzas', narrar: 'Narração', pausa: 'Pausa',
  musica: 'Música', musicaAjuste: 'Ajuste de música', efeito: 'Efeito', som: 'Som',
  mostrar: 'Plano (imagem)', camera: 'Câmera', tremor: 'Tremor', titulo: 'Título', escurecer: 'Escurecer a tela',
};
const TRANSICOES: [Transicao, string][] = [['fusao', 'Fusão'], ['corte', 'Corte seco'], ['preto', 'Pelo preto'], ['branco', 'Pelo branco'], ['deslize', 'Deslize']];
const MOVIMENTOS: [Movimento, string][] = [['aproximar', 'Aproximar'], ['afastar', 'Afastar'], ['esquerda', 'Panorâmica p/ esquerda'], ['direita', 'Panorâmica p/ direita'], ['subir', 'Subir'], ['descer', 'Descer'], ['aproximarRapido', 'Zoom rápido'], ['parado', 'Parada']];
const temPagina = (p: Passo): p is Extract<Passo, { pagina: Pagina }> => 'pagina' in p;

interface Props {
  id: string;
  roteiro: string;
  plano: Plano | null;
  desatualizado: boolean;
  sujo: boolean;
  onAlterar: (p: Plano) => void;
  onSalvar: (p: Plano) => Promise<void>;
  roteiroSujo: boolean;
  onSalvarRoteiro: () => Promise<void>;
}

export function AbaPlano({ id, roteiro, plano, desatualizado, sujo, onAlterar, onSalvar, roteiroSujo, onSalvarRoteiro }: Props) {
  const [modoJson, setModoJson] = useState(false);
  const [json, setJson] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [refeitas, setRefeitas] = useState<Set<number>>(new Set());
  const [refazendo, setRefazendo] = useState<{ cena: number; instrucoes: string } | null>(null);
  const lido = useMemo(() => lerRoteiro(roteiro), [roteiro]);
  const [formatoEscolhido, setFormatoEscolhido] = useState<Formato>('livro');
  const formato: Formato = plano?.formato ?? (plano ? 'livro' : formatoEscolhido);

  function mudarFormato(f: Formato) {
    if (!plano) return setFormatoEscolhido(f);
    if (f === formato) return;
    if (f === 'cinema') {
      if (!confirm('Converter este plano para o formato cinematográfico? A direção, as falas, as músicas e as ilustrações são aproveitadas; cada página vira um plano de câmera. A versão de livro fica no histórico quando você salvar.')) return;
      onAlterar(livroParaCinema(plano));
      setAviso('Convertido para cinema. Revise e salve.');
    } else {
      if (!confirm('Não dá para converter de cinema para livro automaticamente. Gerar um plano novo de livro a partir do roteiro (o atual fica no histórico quando você salvar)?')) return;
      onAlterar({ ...gerarPlano(lido), roteiroHash: hashTexto(roteiro) });
      setAviso('Plano de livro gerado. Revise e salve.');
    }
  }

  const planoAtual = useRef(plano);
  planoAtual.current = plano;
  const [temElenco, setTemElenco] = useState(true);
  const [elenco, setElenco] = useState<Elenco | null>(null);
  const [arquivosSom, setArquivosSom] = useState<{ src: string; nome: string; categoria?: string }[]>([]);
  const gemini = useStatusImagens();
  const [motor, setMotor] = useState<Motor | null>(null);
  const motorAtual: Motor = motor ?? (gemini?.configurado ? 'gemini' : 'claude');
  const [qualidade, setQualidade] = useState<Qualidade>('detalhada');
  useEffect(() => {
    api.elenco(id).then(e => { setElenco(e); setTemElenco(e.personagens.length > 0 || !!e.estilo.trim()); }).catch(() => {});
    // Sons gravados (do projeto e da biblioteca do estúdio) para o passo "Som".
    Promise.all([api.sons(id).catch(() => []), api.biblioteca().catch(() => [])]).then(([a, b]) => setArquivosSom([...a, ...b]));
  }, [id]);
  const arte = useTarefaArte(t => {
    if (t.ilustracoes.length && planoAtual.current) onAlterar(aplicarIlustracoes(planoAtual.current, t.ilustracoes));
  });
  function desenhar(chaves: string[] | 'faltando' | 'todas', instrucoes = '') {
    if (!plano) return;
    const lista = ilustracoesDoPlano(plano).filter(x => x.il.descricao.trim());
    const alvo = chaves === 'todas' ? lista : chaves === 'faltando' ? lista.filter(x => !temArte(x.il)) : lista.filter(x => chaves.includes(x.chave));
    if (!alvo.length) return setErro('Nenhuma ilustração com descrição para desenhar.');
    if (alvo.length > 6 && motorAtual === 'claude' && !confirm(`Desenhar ${alvo.length} ilustrações com o Claude? Leva alguns minutos e consome bastante do limite do seu plano.`)) return;
    setErro('');
    arte.iniciar(() => api.ilustrar(id, alvo.map(itemDe), instrucoes, qualidade, motorAtual));
  }
  const direcao = useDirecao(id, (t, pedidas) => {
    if (!t.cenas?.length) return;
    const recebidas = new Map(t.cenas.map(c => [c.numero, c]));
    const base: Plano = pedidas?.length && plano
      ? { ...plano, origem: 'ia', cenas: plano.cenas.map(c => recebidas.get(c.numero) ?? c) }
      : { versao: 1, titulo: lido.titulo || 'Sem título', geradoEm: new Date().toISOString(), origem: 'ia', formato, roteiroHash: hashTexto(roteiro), cenas: t.cenas };
    setModoJson(false);
    onAlterar(base);
    setRefeitas(new Set(t.cenas.map(c => c.numero)));
  });

  // Tarefas que continuaram rodando enquanto você estava em outra aba: volta a acompanhá-las.
  const { ativas, recarregar } = useTarefas();
  useEffect(() => {
    const d = ativas.find(t => t.tipo === 'direcao');
    if (d && !direcao.rodando) direcao.retomar(d);
    const a = ativas.find(t => t.tipo === 'ilustracao');
    if (a && !arte.rodando) arte.retomar(a);
  }, [ativas]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { recarregar(); }, [direcao.tarefa?.id, direcao.tarefa?.estado, arte.tarefa?.id, arte.tarefa?.estado]); // eslint-disable-line react-hooks/exhaustive-deps

  async function dirigir(opcoes: { cenas?: number[]; instrucoes?: string }) {
    if (!lido.cenas.length) return setErro('O roteiro não tem cenas. Escreva ou cole o roteiro na aba Roteiro.');
    if (!opcoes.cenas && plano && sujo && !confirm('Você tem alterações não salvas no plano. Dirigir de novo vai substituí-las. Continuar?')) return;
    if (roteiroSujo) await onSalvarRoteiro();
    setErro('');
    setRefazendo(null);
    direcao.iniciar({ ...opcoes, formato });
  }

  function gerar() {
    if (!lido.cenas.length) return setErro('O roteiro não tem cenas. Escreva ou cole o roteiro na aba Roteiro.');
    if (plano && !confirm('Gerar de novo substitui o plano atual (a versão anterior fica no histórico ao salvar). Continuar?')) return;
    const livro = { ...gerarPlano(lido), roteiroHash: hashTexto(roteiro) };
    const novo = formato === 'cinema' ? livroParaCinema(livro) : livro;
    onAlterar(novo);
    setErro('');
    setAviso('Plano gerado. Revise e salve.');
  }

  async function salvar() {
    if (!plano) return;
    try {
      let p = plano;
      if (modoJson) {
        p = JSON.parse(json);
        if (p.versao !== 1 || !Array.isArray(p.cenas)) throw new Error('O JSON precisa ter "versao": 1 e uma lista "cenas".');
      }
      await onSalvar({ ...p, origem: p.origem === 'automatico' && sujo ? 'manual' : p.origem });
      setRefeitas(new Set());
      setErro('');
      setAviso('Plano salvo.');
      setTimeout(() => setAviso(''), 2000);
    } catch (e) {
      setErro(e instanceof SyntaxError ? 'O JSON tem um erro de sintaxe. Confira vírgulas e aspas.' : (e as Error).message);
    }
  }

  const alterarPasso = (ci: number, pi: number, novo: Passo | null, mover = 0) => {
    if (!plano) return;
    const cenas = plano.cenas.map((c, i) => {
      if (i !== ci) return c;
      const passos = [...c.passos];
      if (novo === null) passos.splice(pi, 1);
      else passos[pi] = novo;
      if (mover && pi + mover >= 0 && pi + mover < passos.length) [passos[pi], passos[pi + mover]] = [passos[pi + mover], passos[pi]];
      return { ...c, passos };
    });
    onAlterar({ ...plano, cenas });
  };

  return (
    <div className="plano">
      <div className="barra">
        <div>
          <label className="campo">Formato
            <select value={formato} onChange={e => mudarFormato(e.target.value as Formato)} disabled={direcao.rodando || arte.rodando}>
              <option value="livro">Livro animado</option>
              <option value="cinema">Cinematográfico</option>
            </select>
          </label>
          <button onClick={gerar}>{plano ? 'Gerar de novo a partir do roteiro' : 'Gerar plano a partir do roteiro'}</button>
          {plano && (
            <button className="fantasma" onClick={() => { setJson(JSON.stringify(plano, null, 2)); setModoJson(!modoJson); }}>
              {modoJson ? 'Voltar ao editor visual' : 'Editar como JSON'}
            </button>
          )}
        </div>
        <div className="direita">
          {aviso && <span className="ok">{aviso}</span>}
          {plano && <button className="primario" onClick={salvar}>{sujo || modoJson ? 'Salvar plano' : 'Salvo'}</button>}
        </div>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {desatualizado && <p className="alerta">O roteiro mudou depois que este plano foi gerado. Gere de novo para incorporar as mudanças (suas edições manuais serão substituídas).</p>}

      <PainelClaude direcao={direcao} temPlano={!!plano} onDirigir={instrucoes => dirigir({ instrucoes })} />
      {plano && !modoJson && (
        <PainelIlustracoes plano={plano} ctl={arte} temElenco={temElenco} idProjeto={id} qualidade={qualidade} onQualidade={setQualidade} motor={motorAtual} onMotor={setMotor} gemini={gemini} onDesenhar={(faltando, instr) => desenhar(faltando ? 'faltando' : 'todas', instr)} />
      )}

      {!plano ? (
        <div className="vazio">
          <h2>Nenhum plano ainda</h2>
          <p>Peça ao Claude para dirigir acima, ou use o diretor automático, que lê as palavras dos Esquemas de Animação e de Som. Depois você revisa aqui.</p>
          <button onClick={gerar}>Usar o diretor automático</button>
        </div>
      ) : modoJson ? (
        <textarea className="json" value={json} onChange={e => { setJson(e.target.value); onAlterar(plano); }} spellCheck={false} aria-label="Plano em JSON" />
      ) : (
        plano.cenas.map((c, ci) => {
          const ia = tarefaNaCena(ativas, c.numero, ['direcao', 'ilustracao']);
          return (
          <section key={ci} className={`cena-plano${refeitas.has(c.numero) ? ' refeita' : ''}${ia ? ' trabalhando' : ''}`}>
            <div className="cena-topo">
              <h3>Cena {String(c.numero).padStart(2, '0')}</h3>
              {ia && <SeloIA tarefa={ia} />}
              {!ia && refeitas.has(c.numero) && <span className="selo-ia">Feita pelo Claude · revise</span>}
              <button
                className="fantasma direita"
                disabled={direcao.rodando}
                onClick={() => setRefazendo(r => (r?.cena === c.numero ? null : { cena: c.numero, instrucoes: '' }))}
              >
                ✦ Refazer com Claude
              </button>
            </div>
            {refazendo?.cena === c.numero && (
              <form className="refazer" onSubmit={e => { e.preventDefault(); dirigir({ cenas: [c.numero], instrucoes: refazendo.instrucoes }); }}>
                <input
                  autoFocus
                  value={refazendo.instrucoes}
                  onChange={e => setRefazendo({ cena: c.numero, instrucoes: e.target.value })}
                  placeholder="O que mudar nesta cena? ex.: pausa mais longa antes do rasgo, página escura"
                  aria-label={`Pedido para refazer a cena ${c.numero}`}
                />
                <button className="primario" type="submit">Refazer</button>
              </form>
            )}
            <ol>
              {c.passos.map((p, pi) => (
                <li key={pi} className={`passo ${p.tipo}`}>
                  <div className="passo-topo">
                    <strong>{NOMES[p.tipo]}</strong>
                    <EditorPassoCurto passo={p} onMudar={n => alterarPasso(ci, pi, n)} arquivosSom={arquivosSom} />
                    <span className="ferramentas">
                      <button className="icone" onClick={() => alterarPasso(ci, pi, p, -1)} aria-label="Mover para cima">↑</button>
                      <button className="icone" onClick={() => alterarPasso(ci, pi, p, 1)} aria-label="Mover para baixo">↓</button>
                      <button className="icone" onClick={() => alterarPasso(ci, pi, null)} aria-label="Remover passo">×</button>
                    </span>
                  </div>
                  {temPagina(p) && (
                    <EditorPagina
                      id={id}
                      pagina={p.pagina}
                      onMudar={pg => alterarPasso(ci, pi, { ...p, pagina: pg })}
                      ocupado={arte.rodando || direcao.rodando}
                      motor={motorAtual}
                      podeGerar={motorAtual === 'claude' || !!gemini?.configurado}
                      elenco={elenco}
                      contexto={c.passos.slice(pi + 1).filter(x => x.tipo === 'narrar').slice(0, 4).map(x => (x as { texto: string }).texto).join(' ')}
                      onDesenhar={s => desenhar([`c${c.numero}-p${c.passos.slice(0, pi).filter(x => ilustracoesDoPasso(x)).length}-s${s}`])}
                    />
                  )}
                  {p.tipo === 'mostrar' && (
                    <EditorPagina
                      id={id}
                      cinema
                      pagina={{ layout: 'inteira', ilustracoes: [p.ilustracao], escura: p.escura, desfocada: p.desfocada }}
                      onMudar={pg => alterarPasso(ci, pi, { ...p, ilustracao: pg.ilustracoes[0] ?? p.ilustracao, escura: pg.escura || undefined, desfocada: pg.desfocada || undefined })}
                      ocupado={arte.rodando || direcao.rodando}
                      motor={motorAtual}
                      podeGerar={motorAtual === 'claude' || !!gemini?.configurado}
                      elenco={elenco}
                      contexto={c.passos.slice(pi + 1).filter(x => x.tipo === 'narrar').slice(0, 4).map(x => (x as { texto: string }).texto).join(' ')}
                      onDesenhar={() => desenhar([`c${c.numero}-p${c.passos.slice(0, pi).filter(x => ilustracoesDoPasso(x)).length}-s0`])}
                    />
                  )}
                  {p.tipo === 'narrar' && (
                    <textarea className="fala" value={p.texto} rows={2} onChange={e => alterarPasso(ci, pi, { ...p, texto: e.target.value })} aria-label="Texto narrado" />
                  )}
                </li>
              ))}
            </ol>
          </section>
          );
        })
      )}
    </div>
  );
}

function EditorPassoCurto({ passo: p, onMudar, arquivosSom }: { passo: Passo; onMudar: (p: Passo) => void; arquivosSom: { src: string; nome: string; categoria?: string }[] }) {
  switch (p.tipo) {
    case 'virarPagina':
      return (
        <label className="campo">Velocidade
          <select value={p.velocidade ?? 'normal'} onChange={e => onMudar({ ...p, velocidade: e.target.value as Velocidade })}>
            {VELS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
          <input type="checkbox" checked={!!p.manterTexto} onChange={e => onMudar({ ...p, manterTexto: e.target.checked })} /> manter texto da página esquerda
        </label>
      );
    case 'narrar':
      return (
        <label className="campo">Velocidade
          <select value={p.velocidade ?? 1} onChange={e => onMudar({ ...p, velocidade: Number(e.target.value) })}>
            <option value={0.85}>Lenta</option><option value={1}>Normal</option><option value={1.2}>Acelerada</option>
          </select>
          <input type="checkbox" checked={!!p.legenda} onChange={e => onMudar({ ...p, legenda: e.target.checked })} /> como legenda
          <input className="quem-campo" value={p.personagem ?? ''} placeholder="Narrador" onChange={e => onMudar({ ...p, personagem: e.target.value || undefined })} aria-label="Quem fala" />
          <select value={p.estilo ?? 'narracao'} onChange={e => onMudar({ ...p, estilo: e.target.value === 'narracao' ? undefined : (e.target.value as 'fala' | 'pensamento') })} aria-label="Tipo de fala">
            <option value="narracao">Narração</option><option value="fala">Fala</option><option value="pensamento">Pensamento</option>
          </select>
        </label>
      );
    case 'pausa':
      return (
        <label className="campo">
          <input type="number" min={100} step={100} value={p.ms} onChange={e => onMudar({ ...p, ms: Math.max(100, Number(e.target.value)) })} /> ms
        </label>
      );
    case 'musica':
      return (
        <label className="campo">
          <select value={p.acao} onChange={e => onMudar({ ...p, acao: e.target.value as 'tocar' | 'parar' })}>
            <option value="tocar">Tocar</option><option value="parar">Parar</option>
          </select>
          <select value={p.faixa} onChange={e => onMudar({ ...p, faixa: e.target.value as Faixa })}>
            {FAIXAS.map(([f, r]) => <option key={f} value={f}>{r}</option>)}
          </select>
          transição
          <input type="number" min={0} step={0.5} value={p.fade ?? 2} onChange={e => onMudar({ ...p, fade: Number(e.target.value) })} /> s
        </label>
      );
    case 'musicaAjuste':
      return (
        <span className="campo sutil">
          {FAIXAS.find(f => f[0] === p.faixa)?.[1]}
          {p.volume !== undefined && ` · volume ${p.volume}`}
          {p.intensidade !== undefined && ` · intensidade ${p.intensidade}`}
          {p.andamento !== undefined && ` · andamento ${p.andamento} bpm`}
        </span>
      );
    case 'som':
      return <EditorSom passo={p} onMudar={onMudar} arquivos={arquivosSom} chave="" />;
    case 'efeito':
      return (
        <label className="campo">
          <select value={p.efeito} onChange={e => onMudar({ ...p, efeito: e.target.value as Efeito })}>
            {EFEITOS.map(([f, r]) => <option key={f} value={f}>{r}</option>)}
          </select>
        </label>
      );
    case 'mostrar':
      return (
        <span className="campo">
          <select value={p.transicao ?? 'fusao'} onChange={e => onMudar({ ...p, transicao: e.target.value as Transicao })} aria-label="Transição">
            {TRANSICOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
          câmera
          <select value={p.movimento ?? 'aproximar'} onChange={e => onMudar({ ...p, movimento: e.target.value as Movimento })} aria-label="Movimento de câmera">
            {MOVIMENTOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </span>
      );
    case 'camera':
      return (
        <span className="campo">
          <select value={p.movimento} onChange={e => onMudar({ ...p, movimento: e.target.value as Movimento })} aria-label="Movimento de câmera">
            {MOVIMENTOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
          em <input type="number" min={0.5} step={0.5} value={p.duracao ?? 16} onChange={e => onMudar({ ...p, duracao: Number(e.target.value) })} aria-label="Duração" /> s
        </span>
      );
    case 'tremor':
      return (
        <label className="campo">Intensidade
          <input type="range" min={0.2} max={3} step={0.1} value={p.intensidade ?? 1} onChange={e => onMudar({ ...p, intensidade: Number(e.target.value) })} />
        </label>
      );
    case 'titulo':
      return (
        <span className="campo">
          <input value={p.texto} onChange={e => onMudar({ ...p, texto: e.target.value })} aria-label="Título" />
          <input value={p.subtitulo ?? ''} placeholder="Subtítulo (opcional)" onChange={e => onMudar({ ...p, subtitulo: e.target.value || undefined })} aria-label="Subtítulo" />
        </span>
      );
    case 'escurecer':
      return (
        <span className="campo">
          <select value={p.cor ?? 'preto'} onChange={e => onMudar({ ...p, cor: e.target.value as 'preto' | 'branco' })} aria-label="Cor">
            <option value="preto">Para o preto</option><option value="branco">Para o branco</option>
          </select>
          em <input type="number" min={0.2} step={0.1} value={p.duracao ?? 1.5} onChange={e => onMudar({ ...p, duracao: Number(e.target.value) })} aria-label="Duração" /> s
        </span>
      );
    default:
      return null;
  }
}

/** Miniatura 16:9 de um plano de cinema. */
function miniaturaCinema(il?: Ilustracao) {
  const e = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  if (il?.fonte === 'imagem' && il.src) return `<img src="${e(il.src)}" alt="">`;
  if (il?.fonte === 'svg' && il.svg?.trim().startsWith('<svg')) return il.svg.replace(/^<svg/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice"');
  return `<div class="mini-esboco">${e(il?.descricao || 'Sem descrição')}</div>`;
}

function EditorPagina({ id, pagina, onMudar, ocupado, onDesenhar, motor, podeGerar, elenco, contexto, cinema = false }: {
  id: string;
  cinema?: boolean;
  pagina: Pagina;
  onMudar: (p: Pagina) => void;
  ocupado: boolean;
  onDesenhar: (slot: number) => void;
  motor: Motor;
  podeGerar: boolean;
  elenco: Elenco | null;
  contexto: string;
}) {
  const miniatura = useMemo(() => (cinema ? miniaturaCinema(pagina.ilustracoes[0]) : desenharPagina(pagina)), [pagina, cinema]);
  const [enviando, setEnviando] = useState(-1);
  const [erro, setErro] = useState('');
  const slots = cinema ? ['Imagem do plano (16:9)'] : pagina.layout === 'dividida' ? ['Parte de cima', 'Parte de baixo'] : ['Página inteira'];
  const ils: Ilustracao[] = slots.map((_, i) => pagina.ilustracoes[i] ?? { descricao: '', fonte: 'esboco' });
  const mudarIl = (i: number, il: Ilustracao) => onMudar({ ...pagina, ilustracoes: ils.map((x, j) => (j === i ? il : x)) });

  async function enviar(i: number, arq?: File) {
    if (!arq) return;
    setEnviando(i);
    setErro('');
    try {
      const { src } = await api.enviarArte(id, arq);
      mudarIl(i, { ...ils[i], fonte: 'imagem', src });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(-1);
    }
  }

  return (
    <div className="pagina-ed">
      <div className={cinema ? 'miniatura cinema' : 'miniatura'} dangerouslySetInnerHTML={{ __html: miniatura }} aria-hidden />
      <div className="pagina-campos">
        <div className="linha">
          {!cinema && (<>
          <label className="campo">Layout
            <select value={pagina.layout} onChange={e => onMudar({ ...pagina, layout: e.target.value as Pagina['layout'] })}>
              <option value="inteira">Ilustração única</option>
              <option value="dividida">Dividida (cima e baixo)</option>
            </select>
          </label>
          <label className="campo">Sangue
            <select value={pagina.sangue ?? 0} onChange={e => onMudar({ ...pagina, sangue: Number(e.target.value) })}>
              <option value={0}>Nenhum</option><option value={1}>Pouco</option><option value={2}>Médio</option><option value={3}>Muito</option>
            </select>
          </label>
          <label className="campo"><input type="checkbox" checked={!!pagina.bordaQueimada} onChange={e => onMudar({ ...pagina, bordaQueimada: e.target.checked })} /> Borda queimada</label>
          </>)}
          <label className="campo"><input type="checkbox" checked={!!pagina.escura} onChange={e => onMudar({ ...pagina, escura: e.target.checked })} /> Escura</label>
          <label className="campo"><input type="checkbox" checked={!!pagina.desfocada} onChange={e => onMudar({ ...pagina, desfocada: e.target.checked })} /> Começa desfocada</label>
        </div>
        {ils.map((il, i) => (
          <div key={i} className="ilustracao-ed">
            <div className="linha">
              <span className="rotulo">{slots[i]}</span>
              <select value={il.fonte} onChange={e => mudarIl(i, { ...il, fonte: e.target.value as Ilustracao['fonte'] })} aria-label="Fonte da ilustração">
                <option value="esboco">Esboço com a descrição</option>
                <option value="imagem">Minha arte (imagem)</option>
                <option value="svg">{il.svg ? 'Desenho (SVG)' : 'SVG'}</option>
              </select>
              <span className="direita acoes-il">
                <BotaoCopiar
                  texto={() => montarPromptImagem({ descricao: il.descricao, layout: cinema ? 'cinema' : pagina.layout, escura: pagina.escura, contexto }, elenco).texto}
                />
                <button className="fantasma" disabled={ocupado || !il.descricao.trim() || !podeGerar} onClick={() => onDesenhar(i)} title={podeGerar ? '' : 'Configure a chave do Gemini ou troque o motor no painel Ilustrações'}>
                  ✦ {temArte(il) ? 'Refazer' : 'Gerar'} com {motor === 'gemini' ? 'Gemini' : 'Claude'}
                </button>
              </span>
            </div>
            <textarea rows={2} value={il.descricao} placeholder="Descreva o que a ilustração mostra" onChange={e => mudarIl(i, { ...il, descricao: e.target.value })} aria-label={`Descrição: ${slots[i]}`} />
            <ZonaImagem onArquivo={f => enviar(i, f)} ocupado={enviando === i} rotulo={il.fonte === 'imagem' && il.src ? 'Trocar: arraste, cole (Ctrl+V) ou escolha outra imagem' : 'Arraste, cole (Ctrl+V) ou escolha uma imagem'}>
              {il.fonte === 'imagem' && il.src && <img src={il.src} alt="" className="previa-il" />}
            </ZonaImagem>
            {il.fonte === 'svg' && (
              <details className="codigo-svg">
                <summary>{il.svg ? `Código SVG (${Math.round(il.svg.length / 1024)} KB)` : 'Colar código SVG'}</summary>
                <textarea className="codigo" rows={5} value={il.svg ?? ''} placeholder='<svg viewBox="0 0 388 262">…</svg>' onChange={e => mudarIl(i, { ...il, svg: e.target.value })} aria-label="Código SVG" />
              </details>
            )}
          </div>
        ))}
        {erro && <p className="erro">{erro}</p>}
      </div>
    </div>
  );
}
