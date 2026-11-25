import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plano } from '../web/src/core/tipos';
import { CATALOGO_VOZES, falasDoPlano, VOZES_PIPER, type ConfigVozes, type FalaParaGerar, type IdVoz, type ManifestoNarracao } from '../web/src/core/vozes';
import { ErroTarefa, falhar, nova, type TarefaArte } from './ilustrador';

/**
 * Narração em arquivos de áudio com o Piper e o Kokoro (locais, gratuitos).
 * Cada fala vira projetos/<id>/audio/<chave>.wav; o manifesto guarda a duração de cada uma.
 */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (venv: string) => path.join(RAIZ, 'vozes', venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const MOTORES = {
  piper: { python: bin('venv'), script: path.join(RAIZ, 'vozes', 'sintetizar.py'), nome: 'Piper' },
  kokoro: { python: bin('venv-kokoro'), script: path.join(RAIZ, 'vozes', 'sintetizar_kokoro.py'), nome: 'Kokoro' },
};
const PASTA_PIPER = path.join(RAIZ, 'vozes', 'piper');
const ARQ_KOKORO = path.join(RAIZ, 'vozes', 'kokoro', 'kokoro-v1.0.fp16.onnx');
const require = createRequire(import.meta.url);
const FFMPEG: string = require('ffmpeg-static');

export const pastaAudio = (pastaProjeto: string) => path.join(pastaProjeto, 'audio');
const arqManifesto = (pastaProjeto: string) => path.join(pastaAudio(pastaProjeto), 'manifesto.json');

export async function lerManifesto(pastaProjeto: string): Promise<ManifestoNarracao> {
  try {
    return JSON.parse(await readFile(arqManifesto(pastaProjeto), 'utf8'));
  } catch {
    return { itens: {} };
  }
}

const piperOk = () => existsSync(MOTORES.piper.python) && existsSync(MOTORES.piper.script);
const kokoroOk = () => existsSync(MOTORES.kokoro.python) && existsSync(MOTORES.kokoro.script) && existsSync(ARQ_KOKORO);

/** Vozes disponíveis neste computador (as do catálogo cujo motor e arquivos estão instalados). */
export function statusVozes() {
  const vozes = CATALOGO_VOZES.filter(v =>
    v.motor === 'piper' ? piperOk() && existsSync(path.join(PASTA_PIPER, `${VOZES_PIPER.find(p => p.id === v.id)!.arquivo}.onnx`)) : kokoroOk(),
  ).map(v => v.id);
  const instalado = vozes.length > 0;
  return { instalado, piper: piperOk(), kokoro: kokoroOk(), vozes, mensagem: instalado ? 'Vozes prontas.' : 'Nenhuma voz instalada (pasta estudio/vozes).' };
}
/** Compatibilidade com o nome antigo. */
export const statusPiper = statusVozes;

const motorDe = (voz: IdVoz) => (voz.startsWith('kokoro:') ? 'kokoro' : 'piper') as keyof typeof MOTORES;

/** Roda um script de síntese em lote e devolve, linha a linha, cada fala pronta. */
function rodarMotor(motor: keyof typeof MOTORES, entrada: object[], aoTerminar: (saida: string, r: { ms?: number; erro?: string }) => void, sinal?: AbortSignal) {
  const m = MOTORES[motor];
  return new Promise<void>((resolve, reject) => {
    const p = spawn(m.python, [m.script], { windowsHide: true });
    sinal?.addEventListener('abort', () => p.kill());
    let buf = '', err = '';
    p.stdout.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const linha = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!linha.startsWith('{')) continue;
        try {
          const j = JSON.parse(linha);
          aoTerminar(j.saida, { ms: j.ms, erro: j.erro });
        } catch { /* linha de log */ }
      }
    });
    p.stderr.on('data', d => (err = (err + d).slice(-2000)));
    p.on('error', e => reject(new ErroTarefa(`Não foi possível iniciar o ${m.nome}: ${e.message}`)));
    p.on('close', c => (c === 0 || sinal?.aborted ? resolve() : reject(new ErroTarefa(`O ${m.nome} falhou: ${err.slice(-300)}`))));
    p.stdin.end(JSON.stringify(entrada));
  });
}

/** Ajusta tom (semitons) e iguala o volume de todas as vozes. */
function posProcessar(entrada: string, saida: string, tom: number) {
  const filtros = [tom ? `rubberband=pitch=${Math.pow(2, tom / 12).toFixed(5)}` : '', 'loudnorm=I=-18:TP=-1.5:LRA=11', 'aresample=24000'].filter(Boolean).join(',');
  return new Promise<void>((resolve, reject) => {
    const p = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-i', entrada, '-af', filtros, '-ac', '1', saida], { windowsHide: true });
    let err = '';
    p.stderr.on('data', d => (err += d));
    p.on('error', e => reject(e));
    p.on('close', c => (c === 0 ? resolve() : reject(new Error(err.slice(-200)))));
  });
}

/**
 * Sintetiza as falas (Piper e/ou Kokoro) e chama aoTerminar(saida, ms|erro) a cada fala pronta.
 * Cada fala sai primeiro "crua" e depois passa pelo ffmpeg (tom + volume).
 */
export async function sintetizar(
  itens: { texto: string; voz: IdVoz; velocidade: number; tom?: number; saida: string }[],
  aoTerminar: (saida: string, r: { ms?: number; erro?: string }) => void,
  sinal?: AbortSignal,
): Promise<void> {
  if (!statusVozes().instalado) throw new ErroTarefa('Nenhuma voz instalada (pasta estudio/vozes).');
  for (const motor of ['piper', 'kokoro'] as const) {
    const grupo = itens.filter(i => motorDe(i.voz) === motor);
    if (!grupo.length) continue;
    if (motor === 'kokoro' && !kokoroOk()) {
      grupo.forEach(i => aoTerminar(i.saida, { erro: 'O Kokoro não está instalado.' }));
      continue;
    }
    const porCru = new Map(grupo.map(i => [`${i.saida}.cru.wav`, i]));
    const pos: Promise<void>[] = [];
    const entrada = grupo.map(i =>
      motor === 'piper'
        ? { texto: i.texto, modelo: path.join(PASTA_PIPER, `${VOZES_PIPER.find(p => p.id === i.voz)?.arquivo}.onnx`), saida: `${i.saida}.cru.wav`, velocidade: i.velocidade }
        : { texto: i.texto, voz: i.voz.slice('kokoro:'.length), saida: `${i.saida}.cru.wav`, velocidade: i.velocidade },
    );
    await rodarMotor(
      motor,
      entrada,
      (cru, r) => {
        const item = porCru.get(cru) ?? porCru.get(path.normalize(cru));
        if (!item) return;
        if (r.erro || !r.ms) return aoTerminar(item.saida, { erro: r.erro ?? 'sem áudio' });
        pos.push(
          posProcessar(cru, item.saida, item.tom ?? 0)
            .then(() => aoTerminar(item.saida, { ms: r.ms }))
            .catch(e => aoTerminar(item.saida, { erro: `ajuste de áudio falhou: ${(e as Error).message}` }))
            .finally(() => rm(cru, { force: true }).catch(() => {})),
        );
      },
      sinal,
    );
    await Promise.all(pos);
  }
}

/** Gera (só) as falas que ainda não têm áudio. */
export function iniciarNarracao(projeto: string, pastaProjeto: string, plano: Plano, cfg: ConfigVozes): TarefaArte {
  const todas = falasDoPlano(plano, cfg);
  const t = nova('narracao', projeto, todas.length, 'Preparando as falas…');
  t.abortar = new AbortController();
  (async () => {
    const dir = pastaAudio(pastaProjeto);
    await mkdir(dir, { recursive: true });
    const manifesto = await lerManifesto(pastaProjeto);
    const faltam: FalaParaGerar[] = todas.filter(f => !manifesto.itens[f.chave] || !existsSync(path.join(dir, `${f.chave}.wav`)));
    t.feitos = todas.length - faltam.length;
    t.etapa = faltam.length ? `Gerando falas… ${t.feitos} de ${t.total}` : 'Todas as falas já estavam prontas.';
    const porSaida = new Map(faltam.map(f => [path.join(dir, `${f.chave}.wav`), f]));
    let salvarPendente: Promise<void> = Promise.resolve();
    if (faltam.length)
      await sintetizar(
        faltam.map(f => ({ ...f, saida: path.join(dir, `${f.chave}.wav`) })),
        (saida, r) => {
          const f = porSaida.get(path.normalize(saida)) ?? porSaida.get(saida);
          if (f && r.ms) manifesto.itens[f.chave] = { ms: r.ms };
          else if (f) t.avisos.push(`"${f.texto.slice(0, 50)}…": ${r.erro ?? 'falhou'}`);
          t.feitos++;
          t.etapa = `Gerando falas… ${t.feitos} de ${t.total}`;
          // Salva o manifesto aos poucos: se cancelar, o que já foi gerado não se perde.
          salvarPendente = salvarPendente.then(() => writeFile(arqManifesto(pastaProjeto), JSON.stringify(manifesto)));
        },
        t.abortar!.signal,
      );
    await salvarPendente;
    await writeFile(arqManifesto(pastaProjeto), JSON.stringify(manifesto));
    if (t.estado !== 'rodando') return;
    t.estado = 'concluida';
    t.etapa = `${t.total - t.avisos.length} de ${t.total} falas prontas.`;
    t.fim = Date.now();
  })().catch(e => falhar(t, e));
  return t;
}
