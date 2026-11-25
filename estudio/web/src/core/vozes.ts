import type { Plano } from './tipos';

/** Vozes do Piper instaladas em estudio/vozes/piper (pt-BR). */
export const VOZES_PIPER = [
  { id: 'faber', arquivo: 'pt_BR-faber-medium', rotulo: 'Faber' },
  { id: 'cadu', arquivo: 'pt_BR-cadu-medium', rotulo: 'Cadu' },
  { id: 'jeff', arquivo: 'pt_BR-jeff-medium', rotulo: 'Jeff' },
  { id: 'edresson', arquivo: 'pt_BR-edresson-low', rotulo: 'Edresson (qualidade menor)' },
] as const;

/** Vozes do Kokoro (arquivo voices-v1.0.bin). O prefixo diz o idioma de origem e o gênero (ex.: pf = português, feminina). */
export const VOZES_KOKORO = [
  'af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
  'ef_dora', 'em_alex', 'em_santa', 'ff_siwis', 'hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi', 'if_sara', 'im_nicola',
  'jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro', 'jm_kumo', 'pf_dora', 'pm_alex', 'pm_santa',
  'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi', 'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang',
] as const;

const ORIGEM: Record<string, string> = {
  a: 'inglês americano', b: 'inglês britânico', e: 'espanhol', f: 'francês', h: 'hindi', i: 'italiano', j: 'japonês', p: 'português', z: 'chinês',
};

/** Identificador de voz: "faber" (Piper) ou "kokoro:pf_dora". */
export type IdVoz = string;
export type Genero = 'feminina' | 'masculina';

export interface InfoVoz {
  id: IdVoz;
  motor: 'piper' | 'kokoro';
  nome: string;
  genero: Genero;
  /** Vozes que não são de português: falam português com sotaque. */
  experimental: boolean;
  origem: string;
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

export const CATALOGO_VOZES: InfoVoz[] = [
  ...VOZES_PIPER.map(v => ({ id: v.id, motor: 'piper' as const, nome: v.rotulo, genero: 'masculina' as const, experimental: false, origem: 'português' })),
  ...VOZES_KOKORO.map(k => ({
    id: `kokoro:${k}`,
    motor: 'kokoro' as const,
    nome: capital(k.slice(3)),
    genero: (k[1] === 'f' ? 'feminina' : 'masculina') as Genero,
    experimental: k[0] !== 'p',
    origem: ORIGEM[k[0]] ?? k[0],
  })),
];

export const infoVoz = (id: IdVoz) => CATALOGO_VOZES.find(v => v.id === id);

/** Nome amigável de uma voz para listas. */
export const rotuloVoz = (v: InfoVoz) =>
  `${v.nome} · ${v.genero}${v.experimental ? ` · sotaque ${v.origem}` : ''} (${v.motor === 'piper' ? 'Piper' : 'Kokoro'})`;

export interface VozEscolhida {
  voz: IdVoz;
  velocidade: number; // 1 = normal; 1.2 = 20% mais rápida
  tom?: number; // semitons: negativo = mais grave, positivo = mais agudo
}

export interface ConfigVozes {
  narrador: VozEscolhida;
  personagens: Record<string, VozEscolhida>;
}

export const VOZES_PADRAO: ConfigVozes = { narrador: { voz: 'faber', velocidade: 0.95 }, personagens: {} };

/** Voz de uma fala: a do personagem, ou a do narrador. */
export function vozDaFala(cfg: ConfigVozes, personagem?: string): VozEscolhida {
  return (personagem && cfg.personagens[personagem]) || cfg.narrador;
}

/** Hash estável (cyrb53) para nomear o arquivo de áudio de uma fala. */
export function hash53(s: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Velocidade final de uma fala: a da voz vezes a do passo (narração acelerada etc.). */
export const velocidadeFinal = (v: VozEscolhida, velocidadePasso?: number) => Math.round(v.velocidade * (velocidadePasso ?? 1) * 100) / 100;

/** Chave (nome do arquivo) de uma fala: muda se o texto, a voz, a velocidade ou o tom mudarem. */
export const chaveFala = (texto: string, voz: IdVoz, velocidade: number, tom = 0) =>
  hash53(`${voz}|${velocidade.toFixed(2)}|${texto.trim()}${tom ? `|t${tom}` : ''}`);

export interface FalaParaGerar {
  chave: string;
  texto: string;
  voz: IdVoz;
  velocidade: number;
  tom: number;
}

/** Todas as falas do plano com a voz configurada (sem repetição). */
export function falasDoPlano(plano: Plano, cfg: ConfigVozes): FalaParaGerar[] {
  const mapa = new Map<string, FalaParaGerar>();
  for (const c of plano.cenas)
    for (const p of c.passos) {
      if (p.tipo !== 'narrar' || !p.texto.trim()) continue;
      const v = vozDaFala(cfg, p.personagem);
      const velocidade = velocidadeFinal(v, p.velocidade);
      const tom = v.tom ?? 0;
      const chave = chaveFala(p.texto, v.voz, velocidade, tom);
      mapa.set(chave, { chave, texto: p.texto.trim(), voz: v.voz, velocidade, tom });
    }
  return [...mapa.values()];
}

/** Personagens que falam no plano (para configurar as vozes). */
export const personagensDoPlano = (plano: Plano) =>
  [...new Set(plano.cenas.flatMap(c => c.passos).flatMap(p => (p.tipo === 'narrar' && p.personagem ? [p.personagem] : [])))];

export interface ManifestoNarracao {
  itens: Record<string, { ms: number }>;
}
