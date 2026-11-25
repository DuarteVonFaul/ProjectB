import type { Faixa, Mixagem, Passo, Som } from '../core/tipos';

/** Trilhas e efeitos sonoros sintetizados (Web Audio), portados do protótipo do Prólogo. */

let AC: AudioContext;
let master: GainNode, musicBus: GainNode, sfxBus: GainNode, vozBus: GainNode, REV: ConvolverNode, NOISE: AudioBuffer, saidaFinal: AudioNode;

export function audio(): AudioContext {
  if (AC) return AC;
  AC = new AudioContext();
  master = AC.createGain();
  master.gain.value = 0.9;
  const comp = AC.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(AC.destination);
  saidaFinal = comp;
  vozBus = AC.createGain();
  vozBus.gain.value = 1;
  vozBus.connect(master);
  musicBus = AC.createGain();
  musicBus.gain.value = 0.7;
  musicBus.connect(master);
  sfxBus = AC.createGain();
  sfxBus.gain.value = 0.9;
  sfxBus.connect(master);
  REV = AC.createConvolver();
  const len = AC.sampleRate * 3.2;
  const b = AC.createBuffer(2, len, AC.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  REV.buffer = b;
  REV.connect(musicBus);
  NOISE = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const nd = NOISE.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  setInterval(() => musica.tick(), 30);
  return AC;
}

/** Volume da música só nesta tela (o controle de Assistir); 0.7 = como no plano. */
let ajusteMusica = 1, mixAtual: Mixagem = {};
export const volumeMusica = (v: number) => {
  audio();
  ajusteMusica = v / 0.7;
  musicBus.gain.value = 0.7 * (mixAtual.musica ?? 1) * ajusteMusica;
};

const mf = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function env(g: GainNode, t: number, a: number, p: number, hold: number, r: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(p, t + a);
  g.gain.setValueAtTime(p, t + a + hold);
  g.gain.linearRampToValueAtTime(0.0001, t + a + hold + r);
}

interface VoxOpts { a?: number; hold?: number; r?: number; g?: number; lp?: number | null; det?: number }
function vox(out: AudioNode, type: OscillatorType, f: number, t: number, { a = 0.01, hold = 0, r = 0.3, g = 0.1, lp = null, det = 0 }: VoxOpts = {}) {
  const o = AC.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = det;
  const gn = AC.createGain();
  env(gn, t, a, g, hold, r);
  let n: AudioNode = o;
  if (lp) {
    const fl = AC.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    o.connect(fl);
    n = fl;
  }
  n.connect(gn);
  gn.connect(out);
  o.start(t);
  o.stop(t + a + hold + r + 0.05);
}

interface Trilha { def: DefTrilha; out: GainNode; snd: GainNode; step: number; next: number; bpm: number; int: number; srcs: AudioBufferSourceNode[] }
interface DefTrilha { bpm: number; spb: number; start?: (tr: Trilha) => void; fn: (s: number, t: number, tr: Trilha) => void }

const pad = (tr: Trilha, f: number, t: number, dur: number, g: number) => {
  vox(tr.out, 'triangle', f, t, { a: 1.2, hold: Math.max(0, dur - 1.2), r: 1.6, g, lp: 1500, det: -6 });
  vox(tr.out, 'sine', f, t, { a: 1.2, hold: Math.max(0, dur - 1.2), r: 1.6, g, det: 6 });
};
const bell = (tr: Trilha, f: number, t: number, g: number) => {
  vox(tr.out, 'sine', f, t, { a: 0.005, r: 1.8, g });
  vox(tr.out, 'sine', f * 2.76, t, { a: 0.005, r: 0.5, g: g * 0.25 });
};
const strings = (tr: Trilha, f: number, t: number, dur: number, g: number) => {
  vox(tr.out, 'sawtooth', f, t, { a: 0.5, hold: Math.max(0, dur - 0.5), r: 0.8, g, lp: 1100, det: -9 });
  vox(tr.out, 'sawtooth', f, t, { a: 0.5, hold: Math.max(0, dur - 0.5), r: 0.8, g, lp: 1100, det: 9 });
};
const pluck = (tr: Trilha, f: number, t: number, g: number) => vox(tr.out, 'sawtooth', f, t, { a: 0.004, r: 0.16, g, lp: 950 });

function brass(tr: Trilha, fs: number[], t: number, dur: number, g: number) {
  fs.forEach(f => {
    const o = AC.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const fl = AC.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(300, t);
    fl.frequency.linearRampToValueAtTime(2400, t + 0.06);
    fl.frequency.linearRampToValueAtTime(700, t + dur);
    const gn = AC.createGain();
    env(gn, t, 0.03, g, dur * 0.6, dur * 0.5);
    o.connect(fl);
    fl.connect(gn);
    gn.connect(tr.out);
    o.start(t);
    o.stop(t + dur * 1.2 + 0.1);
  });
}
function noiseHit(out: AudioNode, t: number, g: number, type: BiquadFilterType, freq: number, dur: number) {
  const s = AC.createBufferSource();
  s.buffer = NOISE;
  const fl = AC.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = freq;
  const gn = AC.createGain();
  gn.gain.setValueAtTime(g, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl);
  fl.connect(gn);
  gn.connect(out);
  s.start(t, Math.random());
  s.stop(t + dur + 0.05);
}
function drumLow(out: AudioNode, t: number, g: number, f0 = 120, f1 = 42, dur = 0.55) {
  const o = AC.createOscillator();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
  const gn = AC.createGain();
  gn.gain.setValueAtTime(g, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn);
  gn.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}
const taiko = (tr: Trilha, t: number, g: number) => {
  drumLow(tr.out, t, g);
  noiseHit(tr.out, t, g * 0.4, 'lowpass', 400, 0.09);
};
const thump = (tr: Trilha, t: number, g: number) => drumLow(tr.out, t, g, 65, 38, 0.3);

const calmaFn = (I: number) => (s: number, t: number, tr: Trilha) => {
  const b = Math.floor(s / 8) % 4, i = s % 8, bar = (60 / 72) * 4;
  const C = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]][b];
  if (i === 0) {
    C.forEach(n => pad(tr, mf(n), t, bar, 0.04 * I));
    pad(tr, mf(C[0] - 12), t, bar, 0.05 * I);
  }
  if (Math.random() < 0.85) bell(tr, mf(C[[0, 1, 2, 1, 2, 1, 0, 1][i]] + 12 + (i >= 4 ? 12 : 0)), t, 0.028 * I);
  if (s % 32 === 0) for (let k = 0; k < 5; k++) bell(tr, mf(84 + [0, 3, 7, 10, 12][k]), t + k * 0.09, 0.014 * I);
};
const esperancaFn = (s: number, t: number, tr: Trilha) => {
  const b = Math.floor(s / 8) % 4, i = s % 8, bar = (60 / 64) * 4, I = tr.int;
  const C = [[48, 52, 55], [43, 50, 55, 59], [45, 48, 52], [41, 45, 48]][b];
  if (i === 0) {
    C.forEach(n => pad(tr, mf(n), t, bar, 0.04 * I));
    pad(tr, mf(C[0] - 12), t, bar, 0.045 * I);
  }
  const mel = [76, 74, 72, 74, 76, 79, 77, 76, 72, 74, 76, 77, 79, 77, 76, 74];
  if (i % 2 === 0) bell(tr, mf(mel[Math.floor(s / 2) % 16]), t, 0.03 * I);
  else if (Math.random() < 0.5) bell(tr, mf(C[1] + 12), t, 0.012 * I);
};

const TRILHAS: Record<Faixa, DefTrilha> = {
  calma: { bpm: 72, spb: 2, fn: (s, t, tr) => calmaFn(tr.int)(s, t, tr) },
  suave: { bpm: 60, spb: 2, fn: (s, t, tr) => esperancaFn(s, t, { ...tr, int: tr.int * 0.7 } as Trilha) },
  esperanca: { bpm: 64, spb: 2, fn: esperancaFn },
  guerra: {
    bpm: 112,
    spb: 4,
    fn(s, t, tr) {
      const b = Math.floor(s / 16) % 4, i = s % 16, I = tr.int, bar = (60 / 112) * 4;
      const C = [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]][b];
      if (i === 0) {
        C.forEach(n => strings(tr, mf(n - 12), t, bar, 0.03 * I));
        strings(tr, mf(C[0] - 24), t, bar, 0.045 * I);
      }
      if ([0, 3, 6, 8, 11].includes(i) || (I > 1.3 && [13, 14, 15].includes(i))) taiko(tr, t, (i === 0 ? 0.55 : 0.35) * Math.min(I, 1.8));
      if (i === 4 || i === 12) noiseHit(tr.out, t, 0.12 * I, 'highpass', 1800, 0.14);
      if (I > 1.5 && i % 2 === 1) noiseHit(tr.out, t, 0.04, 'highpass', 6000, 0.04);
      if (i === 0 || i === 10) brass(tr, C.map(mf), t, i === 0 ? 0.5 : 0.3, 0.045 * I);
    },
  },
  agonia: {
    bpm: 54,
    spb: 2,
    fn(s, t, tr) {
      const i = s % 16;
      const cl = [[50, 51, 57, 62], [49, 50, 56, 61]][Math.floor(s / 16) % 2];
      if (i === 0) cl.forEach(n => strings(tr, mf(n), t, (60 / 54) * 8, 0.028));
      if (i % 2 === 0) {
        thump(tr, t, 0.55);
        thump(tr, t + 0.2, 0.38);
      }
      if (i === 4 || i === 12) vox(tr.out, 'sawtooth', mf(86 + (i === 12 ? 1 : 0)), t, { a: 1.2, hold: 0.8, r: 2, g: 0.01, lp: 3000 });
    },
  },
  perseguicao: {
    bpm: 132,
    spb: 4,
    fn(s, t, tr) {
      const i = s % 16, I = tr.int;
      const p = [40, 40, 43, 40, 47, 40, 46, 40, 40, 40, 43, 40, 48, 47, 46, 43];
      pluck(tr, mf(p[i]), t, 0.09 * I);
      pluck(tr, mf(p[i] + 12), t, 0.035 * I);
      if (i % 4 === 0) taiko(tr, t, 0.4 * I);
      if (i % 8 === 4) noiseHit(tr.out, t, 0.1 * I, 'highpass', 2000, 0.1);
      if (i === 0) [52, 55, 59].forEach(n => strings(tr, mf(n), t, (60 / tr.bpm) * 4, 0.025 * I));
    },
  },
  fogo: {
    bpm: 120,
    spb: 4,
    start(tr) {
      const src = AC.createBufferSource();
      src.buffer = NOISE;
      src.loop = true;
      const bp = AC.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 650;
      bp.Q.value = 0.5;
      const g = AC.createGain();
      g.gain.value = 0.28;
      src.connect(bp);
      bp.connect(g);
      g.connect(tr.out);
      src.start();
      tr.srcs = [src];
    },
    fn(_s, t, tr) {
      if (Math.random() < 0.45) noiseHit(tr.out, t + Math.random() * 0.1, 0.05 + Math.random() * 0.22, 'highpass', 2400, 0.02 + Math.random() * 0.05);
    },
  },
};

export const musica = {
  tr: {} as Partial<Record<Faixa, Trilha>>,
  ativa(f: Faixa) {
    return !!this.tr[f];
  },
  tocar(f: Faixa, fade = 2, ganho = 1) {
    audio();
    if (this.tr[f]) this.parar(f, 0.05);
    const now = AC.currentTime, def = TRILHAS[f], out = AC.createGain(), snd = AC.createGain();
    snd.gain.value = 0.35;
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(ganho, now + Math.max(0.05, fade));
    out.connect(musicBus);
    out.connect(snd);
    snd.connect(REV);
    const tr: Trilha = { def, out, snd, step: 0, next: now + 0.05, bpm: def.bpm, int: 1, srcs: [] };
    def.start?.(tr);
    this.tr[f] = tr;
  },
  parar(f: Faixa, fade = 2) {
    const tr = this.tr[f];
    if (!tr) return;
    delete this.tr[f];
    const now = AC.currentTime;
    tr.out.gain.cancelScheduledValues(now);
    tr.out.gain.setValueAtTime(tr.out.gain.value, now);
    tr.out.gain.linearRampToValueAtTime(0.0001, now + fade);
    setTimeout(() => {
      tr.srcs.forEach(s => { try { s.stop(); } catch { /* já parado */ } });
      tr.out.disconnect();
      tr.snd.disconnect();
    }, fade * 1000 + 150);
  },
  pararTodas(fade = 1) {
    (Object.keys(this.tr) as Faixa[]).forEach(f => this.parar(f, fade));
  },
  ajustar(f: Faixa, o: { volume?: number; intensidade?: number; andamento?: number; duracao?: number }) {
    const tr = this.tr[f];
    if (!tr) return;
    if (o.intensidade !== undefined) tr.int = o.intensidade;
    if (o.andamento !== undefined) tr.bpm = o.andamento;
    if (o.volume !== undefined) {
      const now = AC.currentTime;
      tr.out.gain.cancelScheduledValues(now);
      tr.out.gain.setValueAtTime(tr.out.gain.value, now);
      tr.out.gain.linearRampToValueAtTime(o.volume, now + (o.duracao ?? 1.5));
    }
  },
  tick() {
    if (!AC) return;
    const ahead = AC.currentTime + 0.15;
    for (const tr of Object.values(this.tr)) {
      if (!tr) continue;
      while (tr.next < ahead) {
        tr.def.fn(tr.step, tr.next, tr);
        tr.step++;
        tr.next += 60 / tr.bpm / tr.def.spb;
      }
    }
  },
};

export const sfx = {
  pagina(rapida: boolean, out: AudioNode = sfxBus) {
    audio();
    const t = AC.currentTime, d = rapida ? 0.3 : 0.6, s = AC.createBufferSource();
    s.buffer = NOISE;
    const bp = AC.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.linearRampToValueAtTime(2800, t + d);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.45, t + d * 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + d);
    s.connect(bp);
    bp.connect(g);
    g.connect(out);
    s.start(t, Math.random());
    s.stop(t + d + 0.05);
    drumLow(out, t + d * 0.8, 0.12, 110, 70, 0.12);
  },
  abrir() {
    this.pagina(false);
    drumLow(sfxBus, AC.currentTime, 0.35, 90, 50, 0.3);
  },
  fechar() {
    audio();
    drumLow(sfxBus, AC.currentTime, 0.6, 80, 40, 0.5);
    noiseHit(sfxBus, AC.currentTime, 0.25, 'lowpass', 800, 0.2);
  },
  respingo() {
    audio();
    noiseHit(sfxBus, AC.currentTime, 0.35, 'lowpass', 500, 0.25);
    drumLow(sfxBus, AC.currentTime, 0.2, 90, 50, 0.2);
  },
  rasgo(out: AudioNode = sfxBus) {
    audio();
    const t = AC.currentTime, s = AC.createBufferSource();
    s.buffer = NOISE;
    const bp = AC.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 1.4;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 24; k++) g.gain.linearRampToValueAtTime(0.35 + Math.random() * 0.65, t + k * 0.045);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.2);
    s.connect(bp);
    bp.connect(g);
    g.connect(out);
    s.start(t);
    s.stop(t + 1.3);
    noiseHit(out, t, 0.5, 'highpass', 3500, 0.6);
  },
  perfurar() {
    audio();
    const t = AC.currentTime;
    drumLow(sfxBus, t, 0.95, 85, 30, 0.5);
    noiseHit(sfxBus, t, 0.6, 'lowpass', 700, 0.3);
    const s = AC.createBufferSource();
    s.buffer = NOISE;
    const bp = AC.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(250, t);
    bp.frequency.linearRampToValueAtTime(900, t + 0.25);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    s.connect(bp);
    bp.connect(g);
    g.connect(sfxBus);
    s.start(t);
    s.stop(t + 0.35);
  },
  explosao(out: AudioNode = sfxBus) {
    audio();
    const t = AC.currentTime;
    drumLow(out, t, 1, 70, 22, 2.4);
    drumLow(out, t + 0.05, 0.7, 140, 30, 1.2);
    noiseHit(out, t, 0.9, 'lowpass', 900, 2.8);
    noiseHit(out, t, 0.5, 'highpass', 3000, 0.25);
    noiseHit(out, t + 0.4, 0.45, 'lowpass', 300, 3.5);
  },
  sopro(d: number) {
    audio();
    const t = AC.currentTime, s = AC.createBufferSource();
    s.buffer = NOISE;
    s.loop = true;
    const lp = AC.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(200, t);
    lp.frequency.linearRampToValueAtTime(2600, t + d * 0.7);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.4, t + d * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + d);
    s.connect(lp);
    lp.connect(g);
    g.connect(sfxBus);
    s.start(t);
    s.stop(t + d + 0.1);
  },
};

// ---------- narração gravada ----------

/** Baixa e decodifica um arquivo de áudio de fala. */
export async function carregarAudio(url: string): Promise<AudioBuffer> {
  audio();
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Áudio não encontrado: ${url}`);
  return AC.decodeAudioData(await r.arrayBuffer());
}

/** Toca um áudio de fala (passa pelo mesmo mixer da música, então entra na gravação do vídeo). */
export function tocarAudio(buf: AudioBuffer): { fim: Promise<void>; parar: () => void } {
  audio();
  const src = AC.createBufferSource();
  src.buffer = buf;
  src.connect(vozBus);
  const fim = new Promise<void>(r => (src.onended = () => r()));
  src.start();
  return { fim, parar: () => { try { src.stop(); } catch { /* já parou */ } } };
}

/** Fluxo com todo o som do estúdio (música, efeitos e narração), para gravar o vídeo. */
export function fluxoDeSaida(): MediaStream {
  audio();
  const destino = AC.createMediaStreamDestination();
  saidaFinal.connect(destino);
  return destino.stream;
}

// ---------- mixagem ----------

/** Volumes gerais do plano: música, efeitos e vozes (1 = padrão). */
export function aplicarMixagem(m: Mixagem = {}) {
  audio();
  mixAtual = m;
  musicBus.gain.value = 0.7 * (m.musica ?? 1) * ajusteMusica;
  sfxBus.gain.value = 0.9 * (m.efeitos ?? 1);
  vozBus.gain.value = m.voz ?? 1;
}

// ---------- biblioteca de sons (passo "som") ----------

function ruidoContinuo(out: AudioNode, type: BiquadFilterType, freq: number, q = 1) {
  const s = AC.createBufferSource();
  s.buffer = NOISE;
  s.loop = true;
  const fl = AC.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = freq;
  fl.Q.value = q;
  s.connect(fl);
  fl.connect(out);
  s.start(AC.currentTime, Math.random());
  return { s, fl };
}
function lfo(alvo: AudioParam, hz: number, prof: number) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.frequency.value = hz;
  g.gain.value = prof;
  o.connect(g);
  g.connect(alvo);
  o.start();
  return o;
}

/** Sons de uma vez. */
const UM: Partial<Record<Som, (out: AudioNode, t: number) => void>> = {
  trovao(out, t) {
    noiseHit(out, t, 0.55, 'highpass', 1800, 0.18);
    drumLow(out, t + 0.05, 0.9, 60, 24, 2.8);
    const s = AC.createBufferSource();
    s.buffer = NOISE;
    s.loop = true;
    const fl = AC.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 220;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1.1, t + 0.12);
    for (let k = 1; k < 9; k++) g.gain.linearRampToValueAtTime((0.4 + Math.random() * 0.7) * (1 - k / 10), t + 0.12 + k * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + 4.2);
    s.connect(fl);
    fl.connect(g);
    g.connect(out);
    s.start(t);
    s.stop(t + 4.3);
  },
  impacto(out, t) {
    drumLow(out, t, 1, 110, 32, 0.9);
    noiseHit(out, t, 0.6, 'lowpass', 1200, 0.35);
  },
  explosao(out) {
    sfx.explosao(out);
  },
  espada(out, t) {
    const s = AC.createBufferSource();
    s.buffer = NOISE;
    const bp = AC.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(3500, t + 0.25);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.15);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.28);
    s.connect(bp);
    bp.connect(g);
    g.connect(out);
    s.start(t);
    s.stop(t + 0.3);
    [1850, 2790, 4120, 5300].forEach((f, i) => vox(out, 'sine', f, t + 0.24, { a: 0.002, r: 1.6 - i * 0.3, g: 0.09 / (i + 1) }));
    noiseHit(out, t + 0.24, 0.35, 'highpass', 3000, 0.08);
  },
  porta(out, t) {
    const o = AC.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    for (let k = 1; k <= 12; k++) o.frequency.linearRampToValueAtTime(60 + Math.random() * 45, t + k * 0.1);
    const bp = AC.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 950;
    bp.Q.value = 7;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.2);
    g.gain.linearRampToValueAtTime(0.35, t + 1.0);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.25);
    o.connect(bp);
    bp.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 1.3);
    drumLow(out, t + 1.3, 0.8, 90, 40, 0.5);
    noiseHit(out, t + 1.3, 0.4, 'lowpass', 700, 0.25);
  },
  passos(out, t) {
    for (let k = 0; k < 5; k++) {
      const tk = t + k * 0.52 + Math.random() * 0.04;
      drumLow(out, tk, 0.35, 95, 55, 0.12);
      noiseHit(out, tk, 0.25, 'lowpass', 600, 0.1);
      noiseHit(out, tk + 0.03, 0.08, 'highpass', 2500, 0.05);
    }
  },
  sino(out, t) {
    [[1, 0.25, 4.5], [2, 0.12, 3], [2.76, 0.1, 2.2], [5.4, 0.05, 1.2], [0.5, 0.12, 5]].forEach(([m, g, r]) =>
      vox(out, 'sine', 392 * m, t, { a: 0.003, r, g }),
    );
  },
  magia(out, t) {
    const esc = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
    esc.forEach((n, i) => vox(out, 'sine', mf(n), t + i * 0.06, { a: 0.005, r: 0.9, g: 0.06 }));
    esc.forEach((n, i) => vox(out, 'triangle', mf(n + 12), t + 0.03 + i * 0.06, { a: 0.005, r: 0.5, g: 0.02 }));
    noiseHit(out, t, 0.12, 'highpass', 6000, 1.2);
  },
  sussurro(out, t) {
    const s = AC.createBufferSource();
    s.buffer = NOISE;
    const bp = AC.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 9; k++) {
      const tk = t + k * 0.22;
      bp.frequency.setValueAtTime(1800 + Math.random() * 2200, tk);
      g.gain.linearRampToValueAtTime(0.35 + Math.random() * 0.25, tk + 0.07);
      g.gain.linearRampToValueAtTime(0.03, tk + 0.2);
    }
    g.gain.linearRampToValueAtTime(0.0001, t + 2.1);
    s.connect(bp);
    bp.connect(g);
    g.connect(out);
    s.start(t, Math.random());
    s.stop(t + 2.2);
  },
  pagina(out) {
    sfx.pagina(false, out);
  },
  rasgo(out) {
    sfx.rasgo(out);
  },
};

/** Sons de ambiente (ficam tocando até parar). Devolvem a função que os desliga. */
const AMBIENTE: Partial<Record<Som, (out: AudioNode) => () => void>> = {
  vento(out) {
    const { s, fl } = ruidoContinuo(out, 'bandpass', 600, 1.4);
    const a = lfo(fl.frequency, 0.13, 380);
    return () => { s.stop(); a.stop(); };
  },
  chuva(out) {
    const g = AC.createGain();
    g.gain.value = 0.35;
    g.connect(out);
    const { s } = ruidoContinuo(g, 'highpass', 1400, 0.5);
    const iv = setInterval(() => { for (let k = 0; k < 3; k++) noiseHit(out, AC.currentTime + Math.random() * 0.05, 0.05 + Math.random() * 0.08, 'highpass', 3500, 0.03); }, 45);
    return () => { s.stop(); clearInterval(iv); };
  },
  fogueira(out) {
    const g = AC.createGain();
    g.gain.value = 0.45;
    g.connect(out);
    const { s } = ruidoContinuo(g, 'lowpass', 500);
    const iv = setInterval(() => { if (Math.random() < 0.6) noiseHit(out, AC.currentTime + Math.random() * 0.1, 0.05 + Math.random() * 0.25, 'highpass', 2000 + Math.random() * 2000, 0.02 + Math.random() * 0.04); }, 70);
    return () => { s.stop(); clearInterval(iv); };
  },
  coracao(out) {
    const bate = () => {
      const t = AC.currentTime + 0.05;
      drumLow(out, t, 0.9, 58, 34, 0.22);
      drumLow(out, t + 0.27, 0.6, 52, 32, 0.2);
    };
    bate();
    const iv = setInterval(bate, 900);
    return () => clearInterval(iv);
  },
  suspense(out) {
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, AC.currentTime);
    g.gain.linearRampToValueAtTime(0.16, AC.currentTime + 3);
    g.connect(out);
    const os = [55, 55.6, 82.4].map(f => { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; return o; });
    const fl = AC.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 260;
    const a = lfo(fl.frequency, 0.08, 120);
    os.forEach(o => { o.connect(fl); o.start(); });
    fl.connect(g);
    return () => { os.forEach(o => o.stop()); a.stop(); };
  },
  tique(out) {
    let k = 0;
    const bate = () => noiseHit(out, AC.currentTime + 0.02, 1.2, 'bandpass', k++ % 2 ? 2400 : 3400, 0.05);
    bate();
    const iv = setInterval(bate, 1000);
    return () => clearInterval(iv);
  },
};

export const ehSomAmbiente = (s?: Som) => !!s && !!AMBIENTE[s];
const idDoSom = (p: { som?: Som; src?: string }) => p.src ?? p.som ?? '';
const buffersSom = new Map<string, Promise<AudioBuffer>>();
const bufferDoArquivo = (src: string) => {
  if (!buffersSom.has(src)) buffersSom.set(src, carregarAudio(src).catch(e => { buffersSom.delete(src); throw e; }));
  return buffersSom.get(src)!;
};

type PassoSom = Extract<Passo, { tipo: 'som' }>;

/** Um som tocando (ou ainda carregando). Todos ficam registrados para poderem ser parados. */
interface SomAtivo { id: string; out: GainNode; parar: () => void; loop: boolean }
let proximo = 0;

export const sons = {
  ativos: new Map<string, SomAtivo>(),

  /** Baixa antes os arquivos de som do plano (para não atrasar na hora). */
  async preCarregar(passos: Passo[]) {
    await Promise.all(passos.filter((p): p is PassoSom => p.tipo === 'som' && !!p.src).map(p => bufferDoArquivo(p.src!).catch(() => null)));
  },

  async tocar(p: PassoSom) {
    audio();
    const id = idDoSom(p);
    if (p.acao === 'parar') return this.parar(id, p.fade ?? 1.5);
    const loop = !!p.loop || (!p.src && ehSomAmbiente(p.som));
    if (loop) this.parar(id, 0.3); // um mesmo ambiente não toca duas vezes por cima
    const out = AC.createGain();
    out.gain.value = p.volume ?? 1;
    out.connect(p.canal === 'musica' ? musicBus : sfxBus);
    // Registra já (antes de carregar o arquivo): um "parar" durante o carregamento também vale.
    const chave = `${id}#${proximo++}`;
    const ativo: SomAtivo = { id, out, parar: () => {}, loop };
    this.ativos.set(chave, ativo);
    const encerrar = () => { if (this.ativos.get(chave) === ativo) { this.ativos.delete(chave); out.disconnect(); } };
    const t = AC.currentTime + 0.02;
    if (p.src) {
      const buf = await bufferDoArquivo(p.src).catch(() => null);
      if (!buf || this.ativos.get(chave) !== ativo) return encerrar(); // falhou ou foi parado enquanto carregava
      const s = AC.createBufferSource();
      s.buffer = buf;
      s.loop = !!p.loop;
      s.connect(out);
      if (p.fade) {
        out.gain.setValueAtTime(0.0001, t);
        out.gain.linearRampToValueAtTime(p.volume ?? 1, t + p.fade);
      }
      s.start(t);
      ativo.parar = () => { try { s.stop(); } catch { /* já parou */ } };
      if (!p.loop) s.onended = encerrar;
      return;
    }
    const amb = p.som && AMBIENTE[p.som];
    if (amb) {
      out.gain.setValueAtTime(0.0001, t);
      out.gain.linearRampToValueAtTime(p.volume ?? 1, t + (p.fade ?? 1.2));
      ativo.parar = amb(out);
      return;
    }
    if (p.som) UM[p.som]?.(out, t);
    setTimeout(encerrar, 6000); // sons sintetizados de uma vez duram menos que isso
  },

  /** Para (com fade) tudo o que está tocando com este som/arquivo. */
  parar(id: string, fade = 1.5) {
    for (const [chave, a] of this.ativos) {
      if (a.id !== id) continue;
      this.ativos.delete(chave);
      this.desligar(a, fade);
    }
  },

  desligar(a: SomAtivo, fade: number) {
    const now = AC.currentTime, f = Math.max(0.05, fade);
    a.out.gain.cancelScheduledValues(now);
    a.out.gain.setValueAtTime(a.out.gain.value, now);
    a.out.gain.linearRampToValueAtTime(0.0001, now + f);
    setTimeout(() => { a.parar(); a.out.disconnect(); }, f * 1000 + 100);
  },

  pararTodos(fade = 0.5) {
    for (const [chave, a] of this.ativos) {
      this.ativos.delete(chave);
      this.desligar(a, fade);
    }
  },
};

/** Sons de ambiente que estariam tocando no início da cena n (para assistir a partir dela). */
export function sonsAtivosAntes(cenas: { numero: number; passos: Passo[] }[], n: number) {
  const ativos = new Map<string, PassoSom>();
  for (const c of cenas) {
    if (c.numero >= n) break;
    for (const p of c.passos) {
      if (p.tipo !== 'som') continue;
      const id = idDoSom(p);
      if (p.acao === 'parar') ativos.delete(id);
      else if (p.loop || ehSomAmbiente(p.som)) ativos.set(id, p);
    }
  }
  return [...ativos.values()];
}

// ---------- prévia (editor de som) ----------

let previa: { parar: () => void } | null = null;
export function pararPrevia() {
  previa?.parar();
  previa = null;
}
/** Toca uma faixa de música ou um som por alguns segundos. */
export function tocarPrevia(alvo: { faixa: Faixa; volume?: number } | PassoSom, segundos = 7) {
  pararPrevia();
  void audio().resume();
  if ('faixa' in alvo) {
    musica.tocar(alvo.faixa, 0.3, alvo.volume ?? 1);
    const to = setTimeout(pararPrevia, segundos * 1000);
    previa = { parar: () => { clearTimeout(to); musica.parar(alvo.faixa, 0.6); } };
    return;
  }
  const id = idDoSom(alvo);
  void sons.tocar({ ...alvo, acao: 'tocar' });
  const to = setTimeout(pararPrevia, segundos * 1000);
  previa = { parar: () => { clearTimeout(to); sons.parar(id, 0.4); } };
}
