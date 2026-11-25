import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Geração de imagens pelo Gemini (Nano Banana) via API REST "Interactions".
 * A chave fica em estudio/.env (ESTUDIO_GEMINI_CHAVE=...) e é lida a cada uso,
 * então não é preciso reiniciar o estúdio depois de colá-la.
 */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQ_ENV = path.join(RAIZ, '.env');
const URL_PADRAO = 'https://generativelanguage.googleapis.com/v1beta/interactions';
export const MODELO_PADRAO = 'gemini-nano-banana-2.1';

function lerEnv(): Record<string, string> {
  if (!existsSync(ARQ_ENV)) return {};
  const out: Record<string, string> = {};
  for (const linha of readFileSync(ARQ_ENV, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linha);
    if (m && !linha.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const config = () => {
  const env = { ...lerEnv(), ...process.env } as Record<string, string | undefined>;
  return {
    chave: env.ESTUDIO_GEMINI_CHAVE?.trim() || '',
    modelo: env.ESTUDIO_GEMINI_MODELO?.trim() || MODELO_PADRAO,
    url: env.ESTUDIO_GEMINI_URL?.trim() || URL_PADRAO,
  };
};

export const statusGemini = () => {
  const c = config();
  return {
    configurado: !!c.chave,
    modelo: c.modelo,
    mensagem: c.chave ? `Gemini pronto (${c.modelo}).` : 'Sem chave do Gemini. Crie estudio/.env com ESTUDIO_GEMINI_CHAVE=sua-chave (veja .env.exemplo).',
  };
};

export class ErroGemini extends Error {}

const mimeDe = (b: Buffer) =>
  b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.slice(0, 4).toString() === 'RIFF' ? 'image/webp' : 'image/png';
export const extensaoDe = (mime: string) => (mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : '.png');

/** Procura o último bloco de imagem na resposta (steps → model_output → content → image). */
function extrairImagem(j: any): string | null {
  if (typeof j?.output_image?.data === 'string') return j.output_image.data;
  let achado: string | null = null;
  for (const passo of Array.isArray(j?.steps) ? j.steps : [])
    for (const bloco of Array.isArray(passo?.content) ? passo.content : [])
      if (bloco?.type === 'image' && typeof bloco.data === 'string') achado = bloco.data;
  return achado;
}

export async function gerarImagem(opcoes: {
  prompt: string;
  proporcao: string;
  referencias?: { mime: string; dados: Buffer }[];
  sinal?: AbortSignal;
}): Promise<{ dados: Buffer; mime: string }> {
  const c = config();
  if (!c.chave) throw new ErroGemini(statusGemini().mensagem);
  const input = [
    { type: 'text', text: opcoes.prompt },
    ...(opcoes.referencias ?? []).slice(0, 4).map(r => ({ type: 'image', mime_type: r.mime, data: r.dados.toString('base64') })),
  ];
  let r: Response;
  try {
    r = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.chave },
      body: JSON.stringify({ model: c.modelo, input, response_format: { type: 'image', aspect_ratio: opcoes.proporcao, image_size: '1K' } }),
      signal: opcoes.sinal ?? AbortSignal.timeout(180_000),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') throw new ErroGemini('O Gemini demorou demais ou o pedido foi cancelado.');
    throw new ErroGemini('Não foi possível falar com o Gemini. Confira a internet.');
  }
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(corpo?.error?.message ?? `HTTP ${r.status}`);
    if (r.status === 400 && /api key/i.test(msg)) throw new ErroGemini('A chave do Gemini é inválida.');
    if (r.status === 403) throw new ErroGemini(`O Gemini recusou a chave (sem permissão ou sem cobrança ativa): ${msg}`);
    if (r.status === 429) throw new ErroGemini(`Limite de uso do Gemini atingido: ${msg}`);
    throw new ErroGemini(`O Gemini respondeu com erro: ${msg}`);
  }
  const b64 = extrairImagem(corpo);
  if (!b64) throw new ErroGemini('O Gemini não devolveu imagem (pode ter recusado o conteúdo da cena). Ajuste a descrição e tente de novo.');
  const dados = Buffer.from(b64, 'base64');
  return { dados, mime: mimeDe(dados) };
}
