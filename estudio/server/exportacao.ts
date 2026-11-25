import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plano } from '../web/src/core/tipos';
import { falasDoPlano, type ConfigVozes, type ManifestoNarracao } from '../web/src/core/vozes';
import { ErroTarefa, falhar, nova, type TarefaArte } from './ilustrador';

/**
 * Exportação de vídeo para Instagram (Reels 9:16):
 * 1. O Microsoft Edge (sem janela, via Playwright) abre a página de gravação e toca o plano salvo em 1280x720,
 *    gravando a imagem; a própria página grava todo o som e anota o tempo de cada fala.
 * 2. O ffmpeg monta 1080x1920: o quadro 16:9 no centro, a própria cena desfocada como fundo,
 *    legendas grandes queimadas abaixo do quadro, H.264 + AAC (formato aceito pelo Instagram).
 */

const require = createRequire(import.meta.url);
const FFMPEG: string = require('ffmpeg-static');

interface LegendaGravada { texto: string; personagem?: string; estilo?: string; ini: number; fim: number }
interface Resultado { t0Epoch: number; duracaoMs: number; legendas: LegendaGravada[] }

export const pastaExportacoes = (pastaProjeto: string) => path.join(pastaProjeto, 'exportacoes');

const pendentesDeAudio = new Map<string, string>(); // tarefa → caminho onde salvar o áudio enviado pela página
export const destinoDoAudio = (tarefa: string) => pendentesDeAudio.get(tarefa);

async function urlDaInterface(): Promise<string> {
  for (const u of [process.env.ESTUDIO_UI_URL, 'http://localhost:5174', 'http://localhost:5175'].filter(Boolean) as string[]) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(2000) });
      if (r.ok && /<div id="raiz">/.test(await r.text())) return u;
    } catch { /* tenta a próxima */ }
  }
  throw new ErroTarefa('Não encontrei a interface do estúdio (rode "npm run dev" ou "npm start").');
}

// ---------- legendas (ASS) ----------
const tempoAss = (ms: number) => {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
const textoAss = (t: string) => t.replace(/\\/g, '＼').replace(/[{}]/g, '').replace(/\r?\n/g, ' ');

export function montarLegendas(legendas: LegendaGravada[]) {
  const linhas = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Alinhamento 8 = topo centralizado; MarginV coloca o texto logo abaixo do quadro 16:9.
    'Style: Fala,Arial,58,&H00FFFFFF,&H00FFFFFF,&H00000000,&H78000000,0,0,0,0,100,100,0,0,1,3.5,1.5,8,80,80,1330,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const validas = legendas.filter(l => l.fim && l.fim > l.ini);
  for (const [i, l] of validas.entries()) {
    // A legenda fica 250 ms a mais na tela, sem encostar na próxima (senão o libass empilha as duas).
    const proxima = validas[i + 1];
    const fim = Math.min(l.fim + 250, proxima ? proxima.ini - 20 : Infinity);
    const nome = l.personagem?.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    const cab = nome ? `{\\fs40\\b1\\c&H6AC4F0&}${textoAss(nome.toUpperCase())}\\N{\\r}` : '';
    const corpo = l.estilo === 'pensamento' ? `{\\i1}${textoAss(l.texto)}` : textoAss(l.texto);
    linhas.push(`Dialogue: 0,${tempoAss(l.ini)},${tempoAss(fim)},Fala,,0,0,0,,${cab}${corpo}`);
  }
  return linhas.join('\n') + '\n';
}

function ffmpeg(args: string[], cwd: string, sinal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { cwd, windowsHide: true });
    sinal?.addEventListener('abort', () => p.kill());
    let err = '';
    p.stderr.on('data', d => (err = (err + d).slice(-3000)));
    p.on('error', e => reject(new ErroTarefa(`Não foi possível iniciar o ffmpeg: ${e.message}`)));
    p.on('close', c => (c === 0 ? resolve() : reject(new ErroTarefa(`O ffmpeg falhou ao montar o vídeo: ${err.split('\n').slice(-4).join(' ')}`))));
  });
}

const nomeArquivo = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';

export function iniciarExportacao(projeto: string, nomeProjeto: string, pastaProjeto: string, plano: Plano, cfg: ConfigVozes, manifesto: ManifestoNarracao): TarefaArte {
  const faltam = falasDoPlano(plano, cfg).filter(f => !manifesto.itens[f.chave]).length;
  if (faltam) throw new ErroTarefa(`Gere a narração antes de exportar: faltam ${faltam} fala(s) com a voz atual.`);
  const totalCenas = plano.cenas.length;
  const t = nova('exportacao', projeto, totalCenas + 1, 'Abrindo o gravador…');
  t.abortar = new AbortController();
  const sinal = t.abortar.signal;
  const tmp = path.join(pastaExportacoes(pastaProjeto), `tmp-${t.id}`);
  pendentesDeAudio.set(t.id, path.join(tmp, 'audio.webm'));

  (async () => {
    await mkdir(tmp, { recursive: true });
    const base = await urlDaInterface();
    const { chromium } = await import('playwright-core');
    let browser;
    try {
      browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    } catch (e) {
      throw new ErroTarefa(`Não foi possível abrir o Microsoft Edge para gravar: ${(e as Error).message.split('\n')[0]}`);
    }
    sinal.addEventListener('abort', () => browser.close().catch(() => {}));
    let resultado: Resultado;
    let arqVideo: string;
    try {
      const contexto = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: tmp, size: { width: 1280, height: 720 } } });
      const tPagina = Date.now();
      const pagina = await contexto.newPage();
      pagina.on('pageerror', e => { console.error('[gravação] erro na página:', e.message); t.avisos.push(`Erro na página de gravação: ${e.message}`); });
      pagina.on('console', m => {
        if (m.type() === 'error' || m.type() === 'warning') console.error(`[gravação] ${m.type()}: ${m.text()}`);
        const c = /^CENA (\d+)/.exec(m.text());
        if (c) {
          t.feitos = Number(c[1]);
          t.etapa = `Gravando cena ${c[1]} de ${totalCenas} (em tempo real)…`;
        }
      });
      await pagina.goto(`${base}/#/exportar/${projeto}?tarefa=${t.id}`);
      await pagina.waitForFunction(() => window.__estudio?.pronto || window.__estudio?.erro, null, { timeout: 120_000 });
      const erro = await pagina.evaluate(() => window.__estudio?.erro);
      if (erro) throw new ErroTarefa(erro);
      t.etapa = 'Gravando (em tempo real)…';
      await pagina.evaluate(() => { void window.__estudio!.iniciar!(); });
      await pagina.waitForFunction(() => window.__estudio?.fim, null, { timeout: 0, polling: 1000 });
      resultado = (await pagina.evaluate(() => window.__estudio!.resultado))!;
      const video = pagina.video();
      await contexto.close();
      arqVideo = (await video?.path()) ?? '';
      // Atraso entre o começo da gravação de vídeo e o começo da animação.
      (resultado as Resultado & { atraso: number }).atraso = Math.max(0, (resultado.t0Epoch - tPagina) / 1000);
    } finally {
      await browser.close().catch(() => {});
    }
    if (t.estado !== 'rodando') return;
    const arqAudio = path.join(tmp, 'audio.webm');
    if (!arqVideo || !existsSync(arqVideo)) throw new ErroTarefa('A gravação de vídeo não foi criada.');
    if (!existsSync(arqAudio)) throw new ErroTarefa('O som da animação não chegou ao servidor.');

    t.etapa = 'Montando o vídeo 9:16 (ffmpeg)…';
    t.feitos = totalCenas;
    await writeFile(path.join(tmp, 'legendas.ass'), montarLegendas(resultado.legendas), 'utf8');
    const atraso = (resultado as Resultado & { atraso: number }).atraso;
    const duracao = resultado.duracaoMs / 1000;
    const final = `${nomeArquivo(nomeProjeto)}-reels-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.mp4`;
    const filtro = [
      '[0:v]fps=30,split=2[a][b]',
      '[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=28,eq=brightness=-0.22:saturation=0.85[fundo]',
      '[b]scale=1080:608[quadro]',
      '[fundo][quadro]overlay=0:(H-h)/2-60,subtitles=legendas.ass[saida]',
    ].join(';');
    await ffmpeg(
      ['-y', '-ss', atraso.toFixed(3), '-i', path.basename(arqVideo), '-i', 'audio.webm', '-t', duracao.toFixed(2),
        '-filter_complex', filtro, '-map', '[saida]', '-map', '1:a',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', 'saida.mp4'],
      tmp,
      sinal,
    );
    await rename(path.join(tmp, 'saida.mp4'), path.join(pastaExportacoes(pastaProjeto), final));
    t.saida = `/exportacoes/${projeto}/${final}`;
    t.feitos = t.total;
    t.estado = 'concluida';
    t.etapa = `Vídeo pronto: ${final} (${Math.round(duracao)} s).`;
    t.fim = Date.now();
  })()
    .catch(e => falhar(t, e))
    .finally(async () => {
      pendentesDeAudio.delete(t.id);
      if (!process.env.ESTUDIO_MANTER_TMP) await rm(tmp, { recursive: true, force: true }).catch(() => {});
    });
  return t;
}

export async function listarExportacoes(projeto: string, pastaProjeto: string) {
  const dir = pastaExportacoes(pastaProjeto);
  if (!existsSync(dir)) return [];
  const arqs = (await readdir(dir)).filter(f => f.endsWith('.mp4'));
  const lista = await Promise.all(arqs.map(async f => ({ nome: f, src: `/exportacoes/${projeto}/${f}`, bytes: (await stat(path.join(dir, f))).size, data: (await stat(path.join(dir, f))).mtime.toISOString() })));
  return lista.sort((a, b) => b.data.localeCompare(a.data));
}
