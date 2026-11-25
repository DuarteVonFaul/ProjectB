import type { Plano } from '../core/tipos';
import { chaveFala, falasDoPlano, velocidadeFinal, vozDaFala, type ConfigVozes, type ManifestoNarracao } from '../core/vozes';
import { carregarAudio, tocarAudio } from './audio';

/**
 * Narração. Se a fala já foi gerada pelo Piper (arquivo de áudio), toca o arquivo;
 * senão, usa a voz do navegador (só para prévia: essa voz não entra no vídeo exportado).
 */

export interface NarracaoGravada {
  projeto: string;
  cfg: ConfigVozes;
  manifesto: ManifestoNarracao;
}

let atual: { parar: () => void } | null = null;

export const narrador = {
  ativo: true,
  voz: null as SpeechSynthesisVoice | null,
  /** Voz e tom do navegador para cada personagem (prévia sem narração gerada). */
  personagens: {} as Record<string, { voz?: string; tom?: number }>,
  /** Narração gerada (Piper) e os áudios já carregados. */
  gravada: null as NarracaoGravada | null,
  buffers: new Map<string, AudioBuffer>(),

  tomPadrao(nome: string) {
    let h = 0;
    for (const c of nome) h = (h * 31 + c.charCodeAt(0)) | 0;
    const tons = [1.1, 0.7, 1.2, 0.95, 0.6, 1.3];
    return tons[Math.abs(h) % tons.length];
  },
  vozes(): SpeechSynthesisVoice[] {
    if (!('speechSynthesis' in window)) return [];
    const vs = speechSynthesis.getVoices();
    const pt = vs.filter(v => /^pt/i.test(v.lang));
    return pt.length ? pt : vs;
  },
  escolherPadrao() {
    const lista = this.vozes();
    this.voz =
      lista.find(v => /Antonio.*Natural/i.test(v.name)) ||
      lista.find(v => /Natural/i.test(v.name) && /pt.BR/i.test(v.lang)) ||
      lista.find(v => /Daniel|Antonio|Ricardo|Fabio|Humberto/i.test(v.name)) ||
      lista.find(v => /pt.BR/i.test(v.lang)) ||
      lista[0] ||
      null;
  },
  definir(nome: string) {
    this.voz = this.vozes().find(v => v.name === nome) ?? null;
  },
  cancelar() {
    atual?.parar();
    atual = null;
    try { speechSynthesis.cancel(); } catch { /* sem suporte */ }
  },

  /** Carrega antes de tocar os áudios gerados das falas do plano. Devolve quantas falas têm áudio. */
  async prepararGravada(plano: Plano, g: NarracaoGravada | null) {
    this.gravada = g;
    if (!g) return { comAudio: 0, total: 0 };
    const falas = falasDoPlano(plano, g.cfg);
    const comAudio = falas.filter(f => g.manifesto.itens[f.chave]);
    await Promise.all(
      comAudio.filter(f => !this.buffers.has(f.chave)).map(async f => {
        try { this.buffers.set(f.chave, await carregarAudio(`/audio/${g.projeto}/${f.chave}.wav`)); } catch { /* fica sem áudio */ }
      }),
    );
    return { comAudio: comAudio.filter(f => this.buffers.has(f.chave)).length, total: falas.length };
  },

  /** Áudio gerado desta fala, se existir. */
  bufferDe(texto: string, personagem?: string, velocidadePasso?: number) {
    const g = this.gravada;
    if (!g) return null;
    const v = vozDaFala(g.cfg, personagem);
    return this.buffers.get(chaveFala(texto, v.voz, velocidadeFinal(v, velocidadePasso), v.tom ?? 0)) ?? null;
  },

  /** Fala o texto; chama onPalavra(charIndex) enquanto fala (para acender as palavras). */
  falar(texto: string, rate = 0.92, onPalavra?: (i: number) => void, personagem?: string, velocidadePasso?: number): Promise<void> {
    const buf = this.ativo ? this.bufferDe(texto, personagem, velocidadePasso) : null;
    if (buf) {
      const t = tocarAudio(buf);
      atual = t;
      const t0 = performance.now(), dur = buf.duration * 1000;
      const iv = setInterval(() => onPalavra?.(Math.floor((texto.length * (performance.now() - t0)) / dur)), 90);
      return t.fim.then(() => { clearInterval(iv); onPalavra?.(texto.length); });
    }
    return new Promise(res => {
      if (!this.ativo || !('speechSynthesis' in window)) {
        setTimeout(res, (texto.length * 62) / rate);
        return;
      }
      if (!this.voz) this.escolherPadrao();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'pt-BR';
      const cfg = personagem ? this.personagens[personagem] ?? {} : {};
      const voz = (cfg.voz && this.vozes().find(v => v.name === cfg.voz)) || this.voz;
      if (voz) u.voice = voz;
      u.rate = rate;
      u.pitch = personagem ? cfg.tom ?? this.tomPadrao(personagem) : 0.85;
      let feito = false;
      const fim = () => {
        if (!feito) {
          feito = true;
          clearTimeout(to);
          res();
        }
      };
      u.onend = fim;
      u.onerror = fim;
      u.onboundary = e => onPalavra?.(e.charIndex);
      const to = setTimeout(fim, (texto.length * 110) / rate + 4000);
      speechSynthesis.speak(u);
    });
  },
};
