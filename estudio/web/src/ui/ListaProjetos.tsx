import { useEffect, useState } from 'react';
import type { Projeto } from '../core/tipos';
import { api } from './api';
import { ir } from './App';
import { ProvedorTarefas, rodando, ROTULO_TAREFA, useTarefas } from './Tarefas';

const SEM_GRUPO = '';
const CHAVE_FECHADOS = 'estudio-grupos-fechados';

export function ListaProjetos() {
  return (
    <ProvedorTarefas>
      <Lista />
    </ProvedorTarefas>
  );
}

function Lista() {
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [nome, setNome] = useState('');
  const [grupo, setGrupo] = useState('');
  const [erro, setErro] = useState('');
  const [fechados, setFechados] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CHAVE_FECHADOS) ?? '[]')); } catch { return new Set(); }
  });
  const ativas = rodando(useTarefas().ativas);

  const carregar = () => api.listar().then(setProjetos).catch(e => setErro(e.message));
  useEffect(() => { carregar(); }, []);
  useEffect(() => {
    try { localStorage.setItem(CHAVE_FECHADOS, JSON.stringify([...fechados])); } catch { /* sem armazenamento */ }
  }, [fechados]);

  const grupos = [...new Set((projetos ?? []).map(p => p.grupo?.trim() || SEM_GRUPO))].sort((a, b) =>
    a === SEM_GRUPO ? 1 : b === SEM_GRUPO ? -1 : a.localeCompare(b, 'pt-BR'),
  );
  const nomesGrupos = grupos.filter(g => g !== SEM_GRUPO);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return setErro('Dê um nome ao projeto.');
    try {
      const p = await api.criar(nome.trim(), '', grupo.trim());
      ir(`#/p/${p.id}/roteiro`);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function excluir(p: Projeto) {
    if (!confirm(`Mover "${p.nome}" para a lixeira? (a pasta fica em projetos/_lixeira)`)) return;
    await api.excluir(p.id);
    carregar();
  }

  async function mover(p: Projeto, destino: string) {
    if (destino === '__novo') {
      const n = prompt('Nome do novo grupo:');
      if (!n?.trim()) return;
      destino = n.trim();
    }
    if (destino === '__sem') destino = SEM_GRUPO;
    try {
      await api.mudarGrupo(p.id, destino);
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function renomearGrupo(g: string) {
    const n = prompt(`Novo nome do grupo "${g}":`, g);
    if (!n?.trim() || n.trim() === g) return;
    await Promise.all((projetos ?? []).filter(p => p.grupo === g).map(p => api.mudarGrupo(p.id, n.trim())));
    carregar();
  }

  const alternar = (g: string) => setFechados(f => { const n = new Set(f); n.has(g) ? n.delete(g) : n.add(g); return n; });

  return (
    <div className="lista">
      <header className="marca">
        <h1>Estúdio de Animação</h1>
        <p>Do roteiro ao livro animado.</p>
      </header>

      <form className="novo" onSubmit={criar}>
        <input value={nome} onChange={e => { setNome(e.target.value); setErro(''); }} placeholder="Nome do novo projeto, ex.: Virtus – Capítulo 1" aria-label="Nome do projeto" />
        <input className="novo-grupo" value={grupo} onChange={e => setGrupo(e.target.value)} list="lista-grupos" placeholder="Grupo (opcional)" aria-label="Grupo do projeto" />
        <datalist id="lista-grupos">{nomesGrupos.map(g => <option key={g} value={g} />)}</datalist>
        <button className="primario" type="submit">Criar projeto</button>
      </form>
      {erro && <p className="erro">{erro}</p>}

      {projetos === null ? (
        <p className="sutil">Carregando…</p>
      ) : projetos.length === 0 ? (
        <p className="sutil">Nenhum projeto ainda. Crie o primeiro acima.</p>
      ) : (
        grupos.map(g => {
          const lista = projetos.filter(p => (p.grupo?.trim() || SEM_GRUPO) === g);
          const fechado = fechados.has(g);
          const ocupados = lista.filter(p => ativas.some(t => t.projeto === p.id)).length;
          const soSemGrupo = grupos.length === 1 && g === SEM_GRUPO;
          return (
            <section key={g || '__sem'} className="grupo-projetos">
              {!soSemGrupo && (
                <div className="grupo-topo">
                  <button className="grupo-titulo" onClick={() => alternar(g)} aria-expanded={!fechado}>
                    <span className="seta" aria-hidden>{fechado ? '▸' : '▾'}</span>
                    {g === SEM_GRUPO ? <span className="sutil">Sem grupo</span> : <span>{g}</span>}
                    <span className="sutil contagem">{lista.length} {lista.length === 1 ? 'projeto' : 'projetos'}</span>
                    {ocupados > 0 && fechado && <span className="orbe" title="IA trabalhando em um projeto deste grupo" />}
                  </button>
                  {g !== SEM_GRUPO && <button className="icone" onClick={() => renomearGrupo(g)} title="Renomear grupo" aria-label={`Renomear o grupo ${g}`}>✎</button>}
                </div>
              )}
              {!fechado && (
                <ul className="projetos">
                  {lista.map(p => {
                    const t = ativas.find(x => x.projeto === p.id);
                    return (
                      <li key={p.id} className={t ? 'ocupado' : ''}>
                        <a href={`#/p/${p.id}/roteiro`}>
                          <strong>{p.nome}</strong>
                          {t ? (
                            <span className="trabalhando-texto"><span className="orbe" aria-hidden /> {ROTULO_TAREFA[t.tipo].ia ? 'Claude trabalhando' : 'Em andamento'}: {ROTULO_TAREFA[t.tipo].nome.toLowerCase()}</span>
                          ) : (
                            <span>Editado em {new Date(p.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          )}
                        </a>
                        <div className="acoes">
                          <select className="mover" value="" onChange={e => mover(p, e.target.value)} aria-label={`Mover ${p.nome} para outro grupo`} title="Mover para outro grupo">
                            <option value="" disabled>Grupo…</option>
                            {nomesGrupos.filter(x => x !== p.grupo).map(x => <option key={x} value={x}>{x}</option>)}
                            {p.grupo && <option value="__sem">Sem grupo</option>}
                            <option value="__novo">Novo grupo…</option>
                          </select>
                          <a className="botao" href={`#/p/${p.id}/assistir`}>▶ Assistir</a>
                          <button className="fantasma" onClick={() => excluir(p)} aria-label={`Excluir ${p.nome}`}>Excluir</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
