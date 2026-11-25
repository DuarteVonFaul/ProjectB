import type { Ilustracao, Pagina } from '../core/tipos';

/** Desenha uma página (viewBox 440x600) como SVG em traço de tinta. */

export const INK = '#3a2313';
export const GOLD = '#b4842c';
export const BLOOD = '#6d0a0a';
const st = (w: number, c = INK) => `stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const f1 = (n: number) => n.toFixed(1);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function rng(seed: number) {
  let a = seed * 9973 + 12345;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function moldura() {
  return (
    `<rect x="16" y="16" width="408" height="568" fill="none" ${st(1.4)}/><rect x="23" y="23" width="394" height="554" fill="none" ${st(0.6)}/>` +
    [[16, 16], [424, 16], [16, 584], [424, 584]].map(([x, y]) => `<path d="M${x - 6},${y} L${x},${y - 6} L${x + 6},${y} L${x},${y + 6}Z" fill="${INK}" ${st(0.6)}/>`).join('')
  );
}
const divisor = (y: number) =>
  `<path d="M40,${y} L205,${y} M235,${y} L400,${y}" fill="none" ${st(0.8)}/><path d="M220,${y - 7} L227,${y} L220,${y + 7} L213,${y}Z" fill="${GOLD}" ${st(0.8)}/>`;

export function manchas(seed: number, n: number, sc = 1, anim = false, ar = [50, 60, 390, 540]) {
  const r = rng(seed);
  let g = '';
  for (let i = 0; i < n; i++) {
    const cx = ar[0] + r() * (ar[2] - ar[0]), cy = ar[1] + r() * (ar[3] - ar[1]), R = (9 + r() * 20) * sc, dl = (i * 0.12).toFixed(2);
    let b = `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R)}"/><circle cx="${f1(cx + R * 0.5)}" cy="${f1(cy - R * 0.3)}" r="${f1(R * 0.6)}"/><circle cx="${f1(cx - R * 0.4)}" cy="${f1(cy + R * 0.35)}" r="${f1(R * 0.55)}"/>`;
    for (let j = 0; j < 7; j++) {
      const a = r() * 6.28, d = R * (1.2 + r() * 1.4);
      b += `<circle cx="${f1(cx + Math.cos(a) * d)}" cy="${f1(cy + Math.sin(a) * d)}" r="${f1(R * (0.06 + r() * 0.18))}"/>`;
    }
    let dr = '';
    const nd = Math.floor(r() * 3);
    for (let j = 0; j < nd; j++) {
      const dx = cx + (r() - 0.5) * R, w = 2 + r() * 3, hh = R * (1.5 + r() * 3);
      dr += `<rect x="${f1(dx)}" y="${f1(cy)}" width="${f1(w)}" height="${f1(hh)}" rx="${f1(w / 2)}" ${anim ? `class="pingo" style="animation-delay:${(i * 0.12 + 0.4).toFixed(2)}s"` : ''}/>`;
    }
    g += `<g ${anim ? `class="respingo" style="animation-delay:${dl}s"` : ''}>${b}</g>${dr}`;
  }
  return `<g class="semtinta" fill="${BLOOD}" fill-opacity=".85">${g}</g>`;
}

const bordaQueimada = `<g class="semtinta"><path d="M23,577 L23,545 Q60,560 90,538 Q120,566 160,542 Q200,568 240,540 Q280,564 320,544 Q360,566 417,536 L417,577Z" fill="#2a1408" fill-opacity=".4"/><path d="M23,545 Q60,560 90,538 Q120,566 160,542 Q200,568 240,540 Q280,564 320,544 Q360,566 417,536" fill="none" stroke="#c2541a" stroke-width="1.6" stroke-opacity=".7"/></g>`;

interface Slot { x: number; y: number; w: number; h: number }

function quebrarTexto(t: string, max: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const p of t.split(/\s+/)) {
    if ((atual + ' ' + p).trim().length > max) {
      if (atual) linhas.push(atual);
      atual = p;
    } else atual = (atual + ' ' + p).trim();
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function esboco(il: Ilustracao, s: Slot, seed: number): string {
  // Moldura tracejada de "esboço" + pena + descrição da cena.
  const r = rng(seed);
  const cx = s.x + s.w / 2;
  let g = `<rect x="${s.x + 14}" y="${s.y + 12}" width="${s.w - 28}" height="${s.h - 24}" rx="6" fill="none" stroke="${INK}" stroke-opacity=".45" stroke-width="1" stroke-dasharray="6 5"/>`;
  // rabiscos decorativos (hachuras) nos cantos
  for (let i = 0; i < 6; i++) {
    const x = s.x + 24 + r() * 30, y = s.y + 22 + i * 6;
    g += `<path d="M${f1(x)},${f1(y)} l${f1(14 + r() * 10)},-4" fill="none" ${st(0.7)} stroke-opacity=".4"/>`;
    g += `<path d="M${f1(s.x + s.w - 60 + r() * 20)},${f1(s.y + s.h - 26 - i * 6)} l${f1(14 + r() * 10)},-4" fill="none" ${st(0.7)} stroke-opacity=".4"/>`;
  }
  // descrição centralizada no espaço, com a pena logo acima
  const LH = 25;
  const max = Math.round(s.w / 10.5);
  const linhas = quebrarTexto(il.descricao || 'Ilustração', max).slice(0, Math.floor((s.h - 100) / LH));
  const bloco = 56 + linhas.length * LH;
  const py = s.y + Math.max(30, (s.h - bloco) / 2) + 12;
  g += `<path d="M${cx - 16},${py + 18} Q${cx - 4},${py - 14} ${cx + 18},${py - 20} Q${cx + 6},${py - 2} ${cx - 16},${py + 18}Z M${cx - 16},${py + 18} L${cx - 22},${py + 26}" fill="${GOLD}" fill-opacity=".35" ${st(1)}/>`;
  const y0 = py + 56;
  g += `<text x="${cx}" y="${y0}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-style="italic" font-size="21" fill="${INK}">` +
    linhas.map((l, i) => `<tspan x="${cx}" dy="${i ? LH : 0}">${esc(l)}</tspan>`).join('') + `</text>`;
  return g;
}

function ilustracao(il: Ilustracao, s: Slot, seed: number): string {
  if (il.fonte === 'imagem' && il.src) {
    // Estilo livre: a imagem preenche o espaço (recortada), com uma moldura fina de tinta.
    const x = s.x + 6, y = s.y + 4, w = s.w - 12, h = s.h - 8, id = `im${seed}`;
    return (
      `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/></clipPath>` +
      `<image class="img-revela" href="${esc(il.src)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>` +
      `<rect class="semtinta" x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="${INK}" stroke-opacity=".55" stroke-width="1.2"/>`
    );
  }
  if (il.fonte === 'svg' && il.svg?.trim().startsWith('<svg'))
    return il.svg.trim().replace(/^<svg/, `<svg x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"`);
  return esboco(il, s, seed);
}

let contador = 1;
export function desenharPagina(p: Pagina | null | undefined): string {
  const seed = contador++;
  let corpo = '';
  const defs = `<clipPath id="pc${seed}"><rect x="23" y="23" width="394" height="554"/></clipPath><filter id="bl${seed}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur class="desfoque" stdDeviation="${p?.desfocada ? 7 : 0}"/></filter>`;
  if (p) {
    if (p.escura) corpo += `<rect x="23" y="23" width="394" height="554" fill="#1b0f08" fill-opacity=".5"/>`;
    const slots: Slot[] = p.layout === 'dividida' ? [{ x: 26, y: 30, w: 388, h: 262 }, { x: 26, y: 308, w: 388, h: 266 }] : [{ x: 26, y: 30, w: 388, h: 544 }];
    let ils = '';
    p.ilustracoes.slice(0, slots.length).forEach((il, i) => (ils += ilustracao(il, slots[i], seed * 7 + i)));
    if (p.layout === 'dividida') ils += divisor(300);
    corpo += `<g filter="url(#bl${seed})">${ils}</g>`;
    if (p.sangue) corpo += manchas(seed * 13, p.sangue * 3, 0.7 + p.sangue * 0.35);
    if (p.bordaQueimada) corpo += bordaQueimada;
  }
  return `<svg viewBox="0 0 440 600" width="440" height="600" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${moldura()}<g clip-path="url(#pc${seed})">${corpo}</g></svg>`;
}
