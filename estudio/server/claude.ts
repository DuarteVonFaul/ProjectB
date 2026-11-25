import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Integração com o Claude através da CLI do Claude Code (`claude -p`), usando a assinatura
 * do usuário. Ordem de busca do executável:
 *   1. variável ESTUDIO_CLAUDE
 *   2. `claude` no PATH (instalação oficial)
 *   3. cópia que vem com o app Claude para Windows
 */

let cache: string | null = null;

const naoVazio = (s: string) => s.trim().split(/\r?\n/).filter(Boolean);
const executar = (cmd: string, args: string[], timeout = 20000) =>
  new Promise<{ codigo: number; saida: string; erro: string }>(res =>
    execFile(cmd, args, { timeout, windowsHide: true }, (e, saida, erro) =>
      res({ codigo: e ? ((e as NodeJS.ErrnoException & { code?: number }).code as unknown as number) || 1 : 0, saida: String(saida), erro: String(erro) }),
    ),
  );

async function copiaDoApp(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  const base = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Claude-Data');
  if (!existsSync(base)) return null;
  const achados: { caminho: string; data: number }[] = [];
  for (const a of await readdir(base)) {
    const cc = path.join(base, a, 'claude-code');
    if (!existsSync(cc)) continue;
    for (const versao of await readdir(cc)) {
      const dirV = path.join(cc, versao);
      if (!(await stat(dirV)).isDirectory()) continue;
      for (const sub of await readdir(dirV)) {
        const exe = path.join(dirV, sub, 'claude.exe');
        if (existsSync(exe)) achados.push({ caminho: exe, data: (await stat(exe)).mtimeMs });
      }
    }
  }
  achados.sort((x, y) => y.data - x.data);
  return achados[0]?.caminho ?? null;
}

/** Permite apontar ESTUDIO_CLAUDE para um script .ts/.js (usado nos testes com uma CLI simulada). */
const comando = (exe: string): [string, string[]] =>
  /\.ts$/.test(exe)
    ? [process.execPath, ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href, exe]]
    : /\.m?js$/.test(exe) ? [process.execPath, [exe]] : [exe, []];

export async function localizarClaude(): Promise<string | null> {
  if (cache && existsSync(cache)) return cache;
  const env = process.env.ESTUDIO_CLAUDE;
  if (env && existsSync(env)) return (cache = env);
  const r = await executar(process.platform === 'win32' ? 'where.exe' : 'which', ['claude']);
  const noPath = naoVazio(r.saida).find(l => /\.(exe)$/i.test(l) || process.platform !== 'win32');
  if (r.codigo === 0 && noPath) return (cache = noPath);
  return (cache = await copiaDoApp());
}

export interface StatusClaude {
  encontrado: boolean;
  caminho: string | null;
  logado: boolean;
  metodo?: string;
  mensagem: string;
}

export async function statusClaude(): Promise<StatusClaude> {
  const caminho = await localizarClaude();
  if (!caminho)
    return { encontrado: false, caminho, logado: false, mensagem: 'A CLI do Claude Code não foi encontrada. Instale com: npm install -g @anthropic-ai/claude-code' };
  const [cmd, pre] = comando(caminho);
  const r = await executar(cmd, [...pre, 'auth', 'status']);
  try {
    const j = JSON.parse(r.saida.slice(r.saida.indexOf('{')));
    if (j.loggedIn) return { encontrado: true, caminho, logado: true, metodo: j.authMethod, mensagem: 'Conectado ao Claude.' };
  } catch {
    /* saída inesperada */
  }
  return { encontrado: true, caminho, logado: false, mensagem: 'A CLI do Claude está instalada, mas sem login. Rode "claude auth login" num terminal e entre com a sua conta.' };
}

export class ErroClaude extends Error {}

export interface ResultadoClaude {
  dados: unknown;
  custoUsd?: number;
  duracaoMs?: number;
}

/**
 * Roda um pedido sem ferramentas, com o prompt de sistema do estúdio e saída validada por JSON Schema.
 * O conteúdo vai pelo stdin (sem limite de linha de comando e sem passar por shell).
 */
export async function perguntarClaude(
  opcoes: { sistema: string; pedido: string; schema: object; timeoutMs?: number; esforco?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' },
  aoIniciar?: (p: ChildProcess) => void,
): Promise<ResultadoClaude> {
  const exe = await localizarClaude();
  if (!exe) throw new ErroClaude('A CLI do Claude Code não foi encontrada.');
  // Pasta vazia como diretório de trabalho: o Claude não enxerga os arquivos do projeto.
  const cwd = path.join(os.tmpdir(), 'estudio-claude');
  await mkdir(cwd, { recursive: true });
  const args = [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(opcoes.schema),
    '--system-prompt', opcoes.sistema,
    '--tools', '',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--setting-sources', '',
  ];
  if (process.env.ESTUDIO_MODELO) args.push('--model', process.env.ESTUDIO_MODELO);
  if (opcoes.esforco) args.push('--effort', opcoes.esforco);

  return new Promise((resolve, reject) => {
    const [cmd, pre] = comando(exe);
    const p = spawn(cmd, [...pre, ...args], { cwd, windowsHide: true });
    aoIniciar?.(p);
    let out = '', err = '';
    const timer = setTimeout(() => {
      p.kill();
      reject(new ErroClaude('O Claude demorou demais para responder (tempo esgotado).'));
    }, opcoes.timeoutMs ?? 8 * 60_000);
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('error', e => {
      clearTimeout(timer);
      reject(new ErroClaude(`Não foi possível iniciar a CLI do Claude: ${e.message}`));
    });
    p.on('close', codigo => {
      clearTimeout(timer);
      if (p.killed && codigo !== 0) return reject(new ErroClaude('Pedido cancelado.'));
      let j: any;
      try {
        j = JSON.parse(out.slice(out.indexOf('{')));
      } catch {
        return reject(new ErroClaude(`Resposta inesperada da CLI do Claude.${err ? ' ' + err.slice(0, 300) : ''}`));
      }
      if (j.is_error) {
        const msg = String(j.result ?? j.subtype ?? 'erro');
        if (/not logged in|login/i.test(msg)) return reject(new ErroClaude('A CLI do Claude está sem login. Rode "claude auth login" num terminal.'));
        if (/limit|usage/i.test(msg)) return reject(new ErroClaude(`Limite de uso do seu plano atingido: ${msg}`));
        return reject(new ErroClaude(`O Claude respondeu com erro: ${msg}`));
      }
      let dados = j.structured_output;
      if (dados === undefined && typeof j.result === 'string') {
        const t = j.result.replace(/^```(?:json)?\s*|\s*```$/g, '');
        try {
          dados = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
        } catch {
          return reject(new ErroClaude('O Claude não devolveu um JSON válido.'));
        }
      }
      resolve({ dados, custoUsd: j.total_cost_usd, duracaoMs: j.duration_ms });
    });
    p.stdin.end(opcoes.pedido);
  });
}
