import express from 'express';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Elenco, Personagem, Plano, Projeto, ProjetoCompleto } from '../web/src/core/tipos';
import { statusClaude } from './claude';
import { cancelarTarefa, iniciarDirecao, iniciarSonoplastia, obterTarefa, resumoTarefa, tarefasParaAplicar, tarefasRodando } from './diretorIA';
import { ErroGemini, statusGemini } from './gemini';
import { artesParaAplicar, artesRodando, cancelarArte, gerarImagemGemini, iniciarElenco, iniciarIlustracoes, obterTarefaArte, resumoArte, type ItemIlustracao } from './ilustrador';
import { montarPromptFolha } from '../web/src/core/promptImagem';
import { CATALOGO_VOZES, chaveFala, VOZES_PADRAO, type ConfigVozes, type IdVoz, type VozEscolhida } from '../web/src/core/vozes';
import { iniciarNarracao, lerManifesto, pastaAudio, sintetizar, statusPiper } from './narracao';
import { destinoDoAudio, iniciarExportacao, listarExportacoes, pastaExportacoes } from './exportacao';
import { ErroTarefa } from './ilustrador';

/**
 * Servidor local do estúdio. Cada projeto é uma pasta em ./projetos:
 *   projetos/<id>/projeto.json   dados do projeto
 *   projetos/<id>/roteiro.txt    roteiro no formato do estúdio
 *   projetos/<id>/plano.json     plano de animação
 *   projetos/<id>/assets/        artes enviadas
 *   projetos/<id>/historico/     versões anteriores do roteiro e do plano
 */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = process.env.ESTUDIO_DADOS ?? path.join(RAIZ, 'projetos');
const PORTA = Number(process.env.ESTUDIO_PORTA ?? 5175);
const MAX_HISTORICO = 50;

const pasta = (id: string) => {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new ErroHttp(400, 'Id de projeto inválido.');
  return path.join(DADOS, id);
};

class ErroHttp extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

const slug = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'projeto';

async function lerJson<T>(arq: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(arq, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function guardarHistorico(dir: string, nome: string, ext: string) {
  const atual = path.join(dir, `${nome}.${ext}`);
  if (!existsSync(atual)) return;
  const hist = path.join(dir, 'historico');
  await mkdir(hist, { recursive: true });
  await copyFile(atual, path.join(hist, `${nome}-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`));
  const antigos = (await readdir(hist)).filter(f => f.startsWith(nome + '-')).sort();
  for (const f of antigos.slice(0, Math.max(0, antigos.length - MAX_HISTORICO))) await rm(path.join(hist, f));
}

async function listar(): Promise<Projeto[]> {
  await mkdir(DADOS, { recursive: true });
  const ids = (await readdir(DADOS, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
  const projetos = await Promise.all(ids.map(id => lerJson<Projeto>(path.join(DADOS, id, 'projeto.json'))));
  return projetos.filter((p): p is Projeto => !!p).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

const nomeGrupo = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');

async function criar(nome: string, roteiro = '', grupo = ''): Promise<Projeto> {
  const base = slug(nome);
  let id = base;
  for (let i = 2; existsSync(path.join(DADOS, id)); i++) id = `${base}-${i}`;
  const agora = new Date().toISOString();
  const projeto: Projeto = { id, nome: nome.trim() || 'Sem título', ...(grupo ? { grupo } : {}), criadoEm: agora, atualizadoEm: agora };
  const dir = pasta(id);
  await mkdir(path.join(dir, 'assets'), { recursive: true });
  await writeFile(path.join(dir, 'projeto.json'), JSON.stringify(projeto, null, 2));
  await writeFile(path.join(dir, 'roteiro.txt'), roteiro);
  return projeto;
}

async function tocarData(id: string) {
  const arq = path.join(pasta(id), 'projeto.json');
  const p = await lerJson<Projeto>(arq);
  if (!p) throw new ErroHttp(404, 'Projeto não encontrado.');
  p.atualizadoEm = new Date().toISOString();
  await writeFile(arq, JSON.stringify(p, null, 2));
  return p;
}

async function semearExemplo() {
  if ((await listar()).length) return;
  const exemplo = path.join(RAIZ, 'exemplos', 'prologo-virtus.txt');
  if (existsSync(exemplo)) await criar('Virtus – Prólogo', await readFile(exemplo, 'utf8'));
}

const app = express();

// Segurança da API local: só atende pedidos do próprio estúdio.
// - Host precisa ser localhost/127.0.0.1 (barra "DNS rebinding").
// - Pedidos que mudam algo precisam do cabeçalho X-Estudio: um site qualquer não consegue enviá-lo
//   sem uma checagem prévia (preflight) que o servidor não autoriza; assim outro site aberto no navegador
//   não dispara direções do Claude, exportações ou envios de arquivo.
const HOST_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
app.use((req, res, next) => {
  if (!HOST_LOCAL.test(req.headers.host ?? '')) return res.status(403).json({ erro: 'Acesso permitido só pelo próprio computador (localhost).' });
  const muda = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (muda && req.header('x-estudio') !== '1') return res.status(403).json({ erro: 'Pedido recusado: não veio da interface do estúdio.' });
  next();
});
app.use(express.json({ limit: '20mb' }));

const rota =
  (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response) =>
    fn(req, res).catch(e => {
      const status = e instanceof ErroHttp ? e.status : 500;
      if (status === 500) console.error(e);
      res.status(status).json({ erro: e instanceof ErroHttp ? e.message : 'Erro interno no servidor.' });
    });

app.get('/api/projetos', rota(async (_req, res) => res.json(await listar())));

app.post('/api/projetos', rota(async (req, res) => {
  const nome = String(req.body?.nome ?? '').trim();
  if (!nome) throw new ErroHttp(400, 'Dê um nome ao projeto.');
  res.status(201).json(await criar(nome, String(req.body?.roteiro ?? ''), nomeGrupo(req.body?.grupo)));
}));

app.get('/api/projetos/:id', rota(async (req, res) => {
  const dir = pasta(String(req.params.id));
  const projeto = await lerJson<Projeto>(path.join(dir, 'projeto.json'));
  if (!projeto) throw new ErroHttp(404, 'Projeto não encontrado.');
  const roteiro = existsSync(path.join(dir, 'roteiro.txt')) ? await readFile(path.join(dir, 'roteiro.txt'), 'utf8') : '';
  const plano = await lerJson<Plano>(path.join(dir, 'plano.json'));
  const completo: ProjetoCompleto = { projeto, roteiro, plano };
  res.json(completo);
}));

app.patch('/api/projetos/:id', rota(async (req, res) => {
  const id = String(req.params.id);
  const arq = path.join(pasta(id), 'projeto.json');
  const p = await lerJson<Projeto>(arq);
  if (!p) throw new ErroHttp(404, 'Projeto não encontrado.');
  // Renomear conta como edição; mudar de grupo é só organização (não mexe em "Editado em").
  if (typeof req.body?.nome === 'string' && req.body.nome.trim() && req.body.nome.trim() !== p.nome) {
    p.nome = req.body.nome.trim();
    p.atualizadoEm = new Date().toISOString();
  }
  if (req.body && 'grupo' in req.body) {
    const g = nomeGrupo(req.body.grupo);
    if (g) p.grupo = g;
    else delete p.grupo;
  }
  await writeFile(arq, JSON.stringify(p, null, 2));
  res.json(p);
}));

app.delete('/api/projetos/:id', rota(async (req, res) => {
  // Não apaga: move para projetos/_lixeira para poder recuperar.
  const id = String(req.params.id);
  const dir = pasta(id);
  if (!existsSync(dir)) throw new ErroHttp(404, 'Projeto não encontrado.');
  const lixeira = path.join(DADOS, '_lixeira');
  await mkdir(lixeira, { recursive: true });
  const { rename } = await import('node:fs/promises');
  await rename(dir, path.join(lixeira, `${id}-${Date.now()}`));
  res.status(204).end();
}));

app.put('/api/projetos/:id/roteiro', rota(async (req, res) => {
  const id = String(req.params.id);
  const dir = pasta(id);
  if (typeof req.body?.texto !== 'string') throw new ErroHttp(400, 'Envie o texto do roteiro.');
  await tocarData(id);
  await guardarHistorico(dir, 'roteiro', 'txt');
  await writeFile(path.join(dir, 'roteiro.txt'), req.body.texto);
  res.json({ ok: true });
}));

app.put('/api/projetos/:id/plano', rota(async (req, res) => {
  const id = String(req.params.id);
  const dir = pasta(id);
  const plano = req.body?.plano as Plano | undefined;
  if (!plano || plano.versao !== 1 || !Array.isArray(plano.cenas)) throw new ErroHttp(400, 'Plano inválido.');
  await tocarData(id);
  await guardarHistorico(dir, 'plano', 'json');
  await writeFile(path.join(dir, 'plano.json'), JSON.stringify(plano, null, 2));
  res.json({ ok: true });
}));

// Rascunho do plano: alterações ainda não salvas (para não se perderem se a página fechar).
app.put('/api/projetos/:id/rascunho', rota(async (req, res) => {
  const dir = pasta(String(req.params.id));
  if (!existsSync(dir)) throw new ErroHttp(404, 'Projeto não encontrado.');
  const plano = req.body?.plano as Plano | undefined;
  if (!plano || plano.versao !== 1 || !Array.isArray(plano.cenas)) throw new ErroHttp(400, 'Plano inválido.');
  await writeFile(path.join(dir, 'plano-rascunho.json'), JSON.stringify({ salvoEm: new Date().toISOString(), plano }));
  res.json({ ok: true });
}));

app.get('/api/projetos/:id/rascunho', rota(async (req, res) => {
  res.json(await lerJson(path.join(pasta(String(req.params.id)), 'plano-rascunho.json')));
}));

app.delete('/api/projetos/:id/rascunho', rota(async (req, res) => {
  await rm(path.join(pasta(String(req.params.id)), 'plano-rascunho.json'), { force: true });
  res.status(204).end();
}));

app.get('/api/projetos/:id/historico', rota(async (req, res) => {
  const hist = path.join(pasta(String(req.params.id)), 'historico');
  if (!existsSync(hist)) return res.json([]);
  const arqs = (await readdir(hist)).sort().reverse();
  res.json(arqs);
}));

// ---------- Claude (via CLI do Claude Code) ----------

app.get('/api/ia/status', rota(async (_req, res) => res.json(await statusClaude())));

const reservados = new Set<string>(); // evita duas direções simultâneas enquanto os arquivos são lidos

const NOME_TAREFA: Record<string, string> = {
  direcao: 'a direção do Claude', som: 'a trilha sonora do Claude', elenco: 'a montagem do elenco',
  ilustracao: 'a geração das ilustrações', narracao: 'a geração da narração', exportacao: 'a exportação do vídeo',
};
/** Recusa a ação se uma tarefa que conflita com ela está rodando neste projeto (e diz qual). */
function exigirLivre(id: string, conflitam: string[]) {
  const t = [...tarefasRodando(id), ...artesRodando(id)].find(x => conflitam.includes(x.tipo));
  if (t) throw new ErroHttp(409, `Aguarde: ${NOME_TAREFA[t.tipo] ?? 'outra tarefa'} ainda está em andamento neste projeto.`);
}

app.post('/api/projetos/:id/dirigir', rota(async (req, res) => {
  const id = String(req.params.id);
  const dir = pasta(id);
  if (!existsSync(dir)) throw new ErroHttp(404, 'Projeto não encontrado.');
  exigirLivre(id, ['direcao', 'som', 'ilustracao', 'elenco']);
  if (reservados.has(id)) throw new ErroHttp(409, 'Aguarde: a direção do Claude ainda está em andamento neste projeto.');
  reservados.add(id);
  try {
    const roteiro = existsSync(path.join(dir, 'roteiro.txt')) ? await readFile(path.join(dir, 'roteiro.txt'), 'utf8') : '';
    if (!roteiro.trim()) throw new ErroHttp(400, 'O roteiro está vazio. Escreva e salve o roteiro primeiro.');
    const plano = await lerJson<Plano>(path.join(dir, 'plano.json'));
    const cenas = Array.isArray(req.body?.cenas) ? req.body.cenas.map(Number).filter((n: number) => Number.isInteger(n)) : undefined;
    const instrucoes = typeof req.body?.instrucoes === 'string' ? req.body.instrucoes.slice(0, 2000) : undefined;
    const formato = req.body?.formato === 'cinema' ? 'cinema' : 'livro';
    const elenco = await lerJson<Elenco>(path.join(dir, 'elenco.json'));
    res.status(202).json(resumoTarefa(iniciarDirecao(id, roteiro, plano, { cenas, instrucoes, formato, elenco })));
  } finally {
    reservados.delete(id);
  }
}));

/**
 * Tarefas rodando agora e resultados prontos que ainda não foram aplicados ao plano
 * (a aba de onde vieram pode estar fechada: ela aplica ao ser aberta e avisa em /aplicada).
 */
app.get('/api/tarefas', rota(async (req, res) => {
  const projeto = typeof req.query.projeto === 'string' ? req.query.projeto : undefined;
  const seg = (t: { inicio: number; fim?: number }) => Math.round(((t.fim ?? Date.now()) - t.inicio) / 1000);
  const ia = (t: ReturnType<typeof tarefasRodando>[number]) => ({ id: t.id, projeto: t.projeto, tipo: t.tipo, estado: t.estado, etapa: t.etapa, alvo: t.alvo, segundos: seg(t) });
  const arte = (t: ReturnType<typeof artesRodando>[number]) => ({ id: t.id, projeto: t.projeto, tipo: t.tipo, estado: t.estado, etapa: t.etapa, alvo: t.alvo ?? [], segundos: seg(t), feitos: t.feitos, total: t.total });
  res.json([...tarefasRodando(projeto).map(ia), ...artesRodando(projeto).map(arte), ...tarefasParaAplicar(projeto).map(ia), ...artesParaAplicar(projeto).map(arte)]);
}));

app.post('/api/tarefas/:tarefa/aplicada', rota(async (req, res) => {
  const t = obterTarefa(String(req.params.tarefa)) ?? obterTarefaArte(String(req.params.tarefa));
  if (t) t.aplicada = true;
  res.status(204).end();
}));

app.post('/api/projetos/:id/sonorizar', rota(async (req, res) => {
  const id = String(req.params.id);
  const dir = pasta(id);
  if (!existsSync(dir)) throw new ErroHttp(404, 'Projeto não encontrado.');
  exigirLivre(id, ['som', 'direcao']);
  const enviado = req.body?.plano;
  const plano: Plano | null = enviado && Array.isArray(enviado.cenas) ? enviado : await lerJson<Plano>(path.join(dir, 'plano.json'));
  if (!plano?.cenas?.length) throw new ErroHttp(400, 'Ainda não há plano. Gere o plano de animação primeiro.');
  const cenas = Array.isArray(req.body?.cenas) ? req.body.cenas.map(Number).filter((n: number) => Number.isInteger(n)) : undefined;
  const instrucoes = typeof req.body?.instrucoes === 'string' ? req.body.instrucoes.slice(0, 2000) : undefined;
  res.status(202).json(resumoTarefa(iniciarSonoplastia(id, plano, { cenas, instrucoes, biblioteca: await listarBiblioteca() })));
}));

app.get('/api/tarefas/:tarefa', rota(async (req, res) => {
  const id = String(req.params.tarefa);
  const t = obterTarefa(id);
  if (t) return res.json(resumoTarefa(t));
  const a = obterTarefaArte(id);
  if (a) return res.json(resumoArte(a, Number(req.query.desde) || 0));
  throw new ErroHttp(404, 'Tarefa não encontrada (o servidor pode ter sido reiniciado).');
}));

app.delete('/api/tarefas/:tarefa', rota(async (req, res) => {
  const id = String(req.params.tarefa);
  if (!cancelarArte(id)) cancelarTarefa(id);
  res.status(204).end();
}));

// ---------- Elenco e ilustrações ----------

app.get('/api/projetos/:id/elenco', rota(async (req, res) => {
  const dir = pasta(String(req.params.id));
  res.json((await lerJson<Elenco>(path.join(dir, 'elenco.json'))) ?? { estilo: '', personagens: [] });
}));

app.put('/api/projetos/:id/elenco', rota(async (req, res) => {
  const id = String(req.params.id);
  const e = req.body as Elenco;
  if (typeof e?.estilo !== 'string' || !Array.isArray(e.personagens)) throw new ErroHttp(400, 'Elenco inválido.');
  const limpo: Elenco = {
    estilo: e.estilo.slice(0, 3000),
    personagens: e.personagens.slice(0, 60).map(p => ({
      nome: String(p?.nome ?? '').slice(0, 120),
      descricao: String(p?.descricao ?? '').slice(0, 2000),
      ...(typeof p?.referencia === 'string' && p.referencia.startsWith(`/arquivos/${id}/`) && /^[\w.-]+$/.test(p.referencia.slice(`/arquivos/${id}/`.length))
        ? { referencia: p.referencia }
        : {}),
    })).filter(p => p.nome),
  };
  await tocarData(id);
  await guardarHistorico(pasta(id), 'elenco', 'json');
  await writeFile(path.join(pasta(id), 'elenco.json'), JSON.stringify(limpo, null, 2));
  res.json(limpo);
}));

app.get('/api/ia/imagens', rota(async (_req, res) => res.json(statusGemini())));

// Folha de referência de um personagem gerada pelo Gemini (síncrono: leva alguns segundos).
app.post('/api/projetos/:id/elenco/referencia', rota(async (req, res) => {
  const id = String(req.params.id);
  const dir = pasta(id);
  if (!existsSync(dir)) throw new ErroHttp(404, 'Projeto não encontrado.');
  const p = req.body?.personagem as Personagem | undefined;
  if (!p?.nome || !p?.descricao) throw new ErroHttp(400, 'Informe nome e aparência do personagem.');
  const estilo = typeof req.body?.estilo === 'string' ? req.body.estilo : '';
  try {
    const src = await gerarImagemGemini(id, path.join(dir, 'assets'), montarPromptFolha(p, estilo), '4:3', p.referencia ? [p.referencia] : [], `ref-${slug(p.nome)}`);
    res.json({ src });
  } catch (e) {
    if (e instanceof ErroGemini) throw new ErroHttp(502, e.message);
    throw e;
  }
}));



app.post('/api/projetos/:id/elenco/gerar', rota(async (req, res) => {
  const id = String(req.params.id);
  const dir = pasta(id);
  if (!existsSync(dir)) throw new ErroHttp(404, 'Projeto não encontrado.');
  exigirLivre(id, ['elenco', 'direcao']);
  const roteiro = existsSync(path.join(dir, 'roteiro.txt')) ? await readFile(path.join(dir, 'roteiro.txt'), 'utf8') : '';
  if (!roteiro.trim()) throw new ErroHttp(400, 'O roteiro está vazio.');
  const plano = (req.body?.plano as Plano | undefined) ?? (await lerJson<Plano>(path.join(dir, 'plano.json')));
  exigirLivre(id, ['elenco', 'direcao']);
  res.status(202).json(resumoArte(iniciarElenco(id, roteiro, plano)));
}));

app.post('/api/projetos/:id/ilustrar', rota(async (req, res) => {
  const id = String(req.params.id);
  const dir = pasta(id);
  if (!existsSync(dir)) throw new ErroHttp(404, 'Projeto não encontrado.');
  exigirLivre(id, ['ilustracao', 'direcao']);
  const itens: ItemIlustracao[] = (Array.isArray(req.body?.itens) ? req.body.itens : [])
    .slice(0, 80)
    .filter((i: any) => typeof i?.chave === 'string' && /^[\w-]{1,40}$/.test(i.chave) && typeof i?.descricao === 'string' && i.descricao.trim())
    .map((i: any) => ({
      chave: i.chave,
      descricao: i.descricao.slice(0, 2000),
      layout: i.layout === 'dividida' || i.layout === 'cinema' ? i.layout : 'inteira',
      escura: i.escura === true,
      contexto: typeof i.contexto === 'string' ? i.contexto.slice(0, 1500) : undefined,
    }));
  if (!itens.length) throw new ErroHttp(400, 'Nenhuma ilustração com descrição para desenhar.');
  const elenco = await lerJson<Elenco>(path.join(dir, 'elenco.json'));
  const instrucoes = typeof req.body?.instrucoes === 'string' ? req.body.instrucoes.slice(0, 1000) : undefined;
  const qualidade = req.body?.qualidade === 'rapida' ? 'rapida' : 'detalhada';
  const motor = req.body?.motor === 'gemini' ? 'gemini' : 'claude';
  if (motor === 'gemini' && !statusGemini().configurado) throw new ErroHttp(400, statusGemini().mensagem);
  res.status(202).json(resumoArte(iniciarIlustracoes(id, path.join(dir, 'assets'), elenco, itens, { instrucoes, qualidade, motor })));
}));

const TIPOS_IMAGEM: Record<string, string> ={ '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp', '.gif': 'gif', '.svg': 'svg' };
const TIPOS_AUDIO = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm']);

app.post('/api/projetos/:id/assets', express.raw({ type: () => true, limit: '40mb' }), rota(async (req, res) => {
  const id = String(req.params.id);
  const dir = path.join(pasta(id), 'assets');
  if (!existsSync(pasta(id))) throw new ErroHttp(404, 'Projeto não encontrado.');
  let original: string;
  try {
    original = decodeURIComponent(String(req.header('x-nome-arquivo') ?? 'arte.png'));
  } catch {
    throw new ErroHttp(400, 'Nome de arquivo inválido.');
  }
  const ext = path.extname(original).toLowerCase();
  if (!TIPOS_IMAGEM[ext] && !TIPOS_AUDIO.has(ext)) throw new ErroHttp(400, 'Envie uma imagem (PNG, JPG, WEBP, GIF, SVG) ou um som (MP3, WAV, OGG, M4A).');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ErroHttp(400, 'Arquivo vazio.');
  await mkdir(dir, { recursive: true });
  const nome = `${Date.now()}-${slug(path.basename(original, ext))}${ext}`;
  await writeFile(path.join(dir, nome), req.body);
  res.status(201).json({ src: `/arquivos/${id}/${nome}` });
}));

/** Sons enviados para o projeto (assets de áudio). */
app.get('/api/projetos/:id/sons', rota(async (req, res) => {
  const id = String(req.params.id);
  const dir = path.join(pasta(id), 'assets');
  if (!existsSync(dir)) return res.json([]);
  const nomes = (await readdir(dir)).filter(n => TIPOS_AUDIO.has(path.extname(n).toLowerCase()));
  const lista = await Promise.all(nomes.map(async n => ({ src: `/arquivos/${id}/${n}`, nome: n.replace(/^\d+-/, '').replace(/\.[^.]+$/, '').replace(/-/g, ' '), bytes: (await stat(path.join(dir, n))).size })));
  res.json(lista);
}));

/** Biblioteca de sons do estúdio (estudio/sons/<categoria>/*.mp3), para todos os projetos. */
const PASTA_SONS = path.join(RAIZ, 'sons');
async function listarBiblioteca() {
  if (!existsSync(PASTA_SONS)) return [];
  const cats = (await readdir(PASTA_SONS, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  const lista = [];
  for (const cat of cats)
    for (const n of (await readdir(path.join(PASTA_SONS, cat))).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })))
      if (TIPOS_AUDIO.has(path.extname(n).toLowerCase()))
        lista.push({ src: `/sons/${encodeURIComponent(cat)}/${encodeURIComponent(n)}`, nome: n.replace(/\.[^.]+$/, '').replace(/-/g, ' '), categoria: cat.replace(/-/g, ' ') });
  return lista;
}
app.get('/api/sons', rota(async (_req, res) => res.json(await listarBiblioteca())));
app.get('/sons/:categoria/:arquivo', rota(async (req, res) => {
  // Aceita qualquer nome (acentos, espaços), desde que o arquivo fique exatamente em sons/<categoria>/.
  const cat = String(req.params.categoria), arq = String(req.params.arquivo);
  const caminho = path.resolve(PASTA_SONS, cat, arq);
  if (path.dirname(path.dirname(caminho)) !== path.resolve(PASTA_SONS) || cat.startsWith('.') || arq.startsWith('.') || !TIPOS_AUDIO.has(path.extname(arq).toLowerCase()))
    throw new ErroHttp(400, 'Nome inválido.');
  if (!existsSync(caminho)) throw new ErroHttp(404, 'Som não encontrado.');
  res.sendFile(caminho, { maxAge: '1d' });
}));

app.get('/arquivos/:id/:arquivo', rota(async (req, res) => {
  const arq = String(req.params.arquivo);
  if (!/^[\w.-]+$/.test(arq)) throw new ErroHttp(400, 'Nome inválido.');
  const caminho = path.join(pasta(String(req.params.id)), 'assets', arq);
  if (!existsSync(caminho) || !(await stat(caminho)).isFile()) throw new ErroHttp(404, 'Arquivo não encontrado.');
  // Um SVG enviado pode conter script: aberto direto no navegador, ele não pode rodar nada na origem do estúdio.
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(caminho);
}));

// ---------- Vozes e narração (Piper) ----------

const ehVoz = (v: unknown): v is IdVoz => CATALOGO_VOZES.some(x => x.id === v);
const lerVozes = async (dir: string): Promise<ConfigVozes> => {
  const c = await lerJson<ConfigVozes>(path.join(dir, 'vozes.json'));
  return c?.narrador ? { narrador: c.narrador, personagens: c.personagens ?? {} } : VOZES_PADRAO;
};
const vozValida = (v: any, padrao: VozEscolhida): VozEscolhida => ({
  voz: ehVoz(v?.voz) ? v.voz : padrao.voz,
  velocidade: Math.min(1.6, Math.max(0.6, Number(v?.velocidade) || padrao.velocidade)),
  ...(Number(v?.tom) ? { tom: Math.round(Math.min(8, Math.max(-8, Number(v.tom)))) } : {}),
});

app.get('/api/vozes/status', rota(async (_req, res) => res.json(statusPiper())));

app.get('/api/projetos/:id/vozes', rota(async (req, res) => res.json(await lerVozes(pasta(String(req.params.id))))));

app.put('/api/projetos/:id/vozes', rota(async (req, res) => {
  const id = String(req.params.id);
  const narrador = vozValida(req.body?.narrador, VOZES_PADRAO.narrador);
  const personagens: Record<string, VozEscolhida> = {};
  for (const [nome, v] of Object.entries(req.body?.personagens ?? {}).slice(0, 60)) personagens[String(nome).slice(0, 120)] = vozValida(v, narrador);
  const cfg: ConfigVozes = { narrador, personagens };
  await tocarData(id);
  await writeFile(path.join(pasta(id), 'vozes.json'), JSON.stringify(cfg, null, 2));
  res.json(cfg);
}));

// Amostra de voz para ouvir antes de escolher (fica em cache em estudio/vozes/amostras).
const PASTA_AMOSTRAS = path.join(RAIZ, 'vozes', 'amostras');
app.post('/api/vozes/amostra', rota(async (req, res) => {
  const voz = req.body?.voz;
  if (!ehVoz(voz)) throw new ErroHttp(400, 'Voz desconhecida.');
  const velocidade = Math.min(1.6, Math.max(0.6, Number(req.body?.velocidade) || 1));
  const texto = String(req.body?.texto ?? '').trim().slice(0, 300) || 'Em uma era distante, uma nova história começa a ser contada.';
  const tom = Math.round(Math.min(8, Math.max(-8, Number(req.body?.tom) || 0)));
  const nome = `${chaveFala(texto, voz, velocidade, tom)}.wav`;
  await mkdir(PASTA_AMOSTRAS, { recursive: true });
  const saida = path.join(PASTA_AMOSTRAS, nome);
  if (!existsSync(saida)) {
    let erro: string | undefined;
    await sintetizar([{ texto, voz, velocidade, tom, saida }], (_s, r) => (erro = r.erro));
    if (erro || !existsSync(saida)) throw new ErroHttp(500, `Não foi possível gerar a amostra: ${erro ?? 'erro desconhecido'}`);
  }
  res.json({ src: `/amostra/${nome}` });
}));

app.get('/amostra/:arquivo', rota(async (req, res) => {
  const arq = String(req.params.arquivo);
  if (!/^[\w]+\.wav$/.test(arq) || !existsSync(path.join(PASTA_AMOSTRAS, arq))) throw new ErroHttp(404, 'Amostra não encontrada.');
  res.sendFile(path.join(PASTA_AMOSTRAS, arq));
}));

app.get('/api/projetos/:id/narracao', rota(async (req, res) => res.json(await lerManifesto(pasta(String(req.params.id))))));

app.post('/api/projetos/:id/narracao', rota(async (req, res) => {
  const id = String(req.params.id);
  const dir = pasta(id);
  if (!existsSync(dir)) throw new ErroHttp(404, 'Projeto não encontrado.');
  exigirLivre(id, ['narracao', 'exportacao']);
  const plano = (req.body?.plano as Plano | undefined) ?? (await lerJson<Plano>(path.join(dir, 'plano.json')));
  if (!plano?.cenas?.length) throw new ErroHttp(400, 'O projeto não tem plano de animação.');
  if (!statusPiper().instalado) throw new ErroHttp(400, statusPiper().mensagem);
  res.status(202).json(resumoArte(iniciarNarracao(id, dir, plano, await lerVozes(dir))));
}));

app.get('/audio/:id/:arquivo', rota(async (req, res) => {
  const arq = String(req.params.arquivo);
  if (!/^[\w]+\.wav$/.test(arq)) throw new ErroHttp(400, 'Nome inválido.');
  const caminho = path.join(pastaAudio(pasta(String(req.params.id))), arq);
  if (!existsSync(caminho)) throw new ErroHttp(404, 'Áudio não encontrado.');
  res.sendFile(caminho);
}));

// ---------- Exportação de vídeo ----------

app.post('/api/projetos/:id/exportar', rota(async (req, res) => {
  const id = String(req.params.id);
  const dir = pasta(id);
  const projeto = await lerJson<Projeto>(path.join(dir, 'projeto.json'));
  if (!projeto) throw new ErroHttp(404, 'Projeto não encontrado.');
  exigirLivre(id, ['exportacao', 'narracao']);
  const plano = await lerJson<Plano>(path.join(dir, 'plano.json'));
  if (!plano?.cenas?.length) throw new ErroHttp(400, 'Salve o plano de animação antes de exportar.');
  try {
    res.status(202).json(resumoArte(iniciarExportacao(id, projeto.nome, dir, plano, await lerVozes(dir), await lerManifesto(dir))));
  } catch (e) {
    if (e instanceof ErroTarefa) throw new ErroHttp(400, e.message);
    throw e;
  }
}));

// A página de gravação envia o som gravado para cá.
app.put('/api/projetos/:id/exportacoes/:tarefa/audio', express.raw({ type: () => true, limit: '300mb' }), rota(async (req, res) => {
  const destino = destinoDoAudio(String(req.params.tarefa));
  if (!destino) throw new ErroHttp(404, 'Exportação não encontrada.');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ErroHttp(400, 'Áudio vazio.');
  await writeFile(destino, req.body);
  res.json({ ok: true });
}));

app.get('/api/projetos/:id/exportacoes', rota(async (req, res) => {
  const id = String(req.params.id);
  res.json(await listarExportacoes(id, pasta(id)));
}));

app.get('/exportacoes/:id/:arquivo', rota(async (req, res) => {
  const arq = String(req.params.arquivo);
  if (!/^[\w.-]+\.mp4$/.test(arq)) throw new ErroHttp(400, 'Nome inválido.');
  const caminho = path.join(pastaExportacoes(pasta(String(req.params.id))), arq);
  if (!existsSync(caminho)) throw new ErroHttp(404, 'Vídeo não encontrado.');
  if (req.query.baixar) res.download(caminho, arq);
  else res.sendFile(caminho);
}));

// Em produção (npm start) serve a interface já compilada.
const DIST = path.join(RAIZ, 'dist');
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^\/(?!api|arquivos|audio|amostra|exportacoes|sons\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

await semearExemplo();
app.listen(PORTA, '127.0.0.1', () => {
  console.log(`Estúdio rodando em http://localhost:${PORTA}${existsSync(DIST) ? '' : ' (API; a interface está em http://localhost:5174)'}`);
});
