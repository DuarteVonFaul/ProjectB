/** Partículas no canvas do palco: poeira, brilhos, fogo, brasas e cinzas. */

export interface Particula {
  x: number; y: number; vx: number; vy: number; s: number; l: number; m: number;
  c: string; a: number; g: number; fogo?: boolean; cinza?: boolean; pisca?: boolean; rot?: number;
}

export class Particulas {
  P: Particula[] = [];
  brilho = 0;
  /** Onde nascem os brilhos: [x, y, largura, altura] (padrão: página direita do livro). */
  areaBrilho: [number, number, number, number] = [660, 120, 400, 500];
  fogo: { x: number; y: number; w: number; int: number } | null = null;
  private acc: Record<string, number> = {};
  private spr: Record<string, HTMLCanvasElement> = {};
  private ctx: CanvasRenderingContext2D;
  private ultimo = performance.now();
  private vivo = true;

  constructor(private canvas: HTMLCanvasElement, private luz: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    requestAnimationFrame(t => this.quadro(t));
  }
  destruir() {
    this.vivo = false;
  }
  limpar() {
    this.P.length = 0;
    this.brilho = 0;
    this.fogo = null;
  }
  criar(o: Partial<Particula> & { x: number; y: number }) {
    if (this.P.length < 1000) this.P.push({ vx: 0, vy: 0, s: 3, l: 0, m: 2, c: '255,210,130', a: 1, g: 0, ...o });
  }
  private sprite(c: string) {
    if (this.spr[c]) return this.spr[c];
    const o = document.createElement('canvas');
    o.width = o.height = 64;
    const g = o.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${c},1)`);
    gr.addColorStop(0.35, `rgba(${c},.5)`);
    gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return (this.spr[c] = o);
  }
  private emitir(nome: string, taxa: number, dt: number, fn: () => void) {
    this.acc[nome] = (this.acc[nome] || 0) + taxa * dt;
    while (this.acc[nome] >= 1) {
      this.acc[nome]--;
      fn();
    }
  }
  private quadro(agora: number) {
    if (!this.vivo) return;
    const dt = Math.min(0.05, (agora - this.ultimo) / 1000);
    this.ultimo = agora;
    const R = Math.random;
    this.emitir('poeira', 3, dt, () => this.criar({ x: R() * 1280, y: R() * 720, vx: (R() - 0.5) * 6, vy: -2 - R() * 4, s: 1.5 + R() * 2, m: 6 + R() * 4, a: 0.22, c: '255,225,180' }));
    if (this.brilho) this.emitir('brilho', this.brilho, dt, () => this.criar({ x: this.areaBrilho[0] + R() * this.areaBrilho[2], y: this.areaBrilho[1] + R() * this.areaBrilho[3], vy: -10 - R() * 25, vx: (R() - 0.5) * 8, s: 2 + R() * 4, m: 1.5 + R() * 2, c: '255,205,110', pisca: true }));
    const F = this.fogo;
    if (F) {
      this.emitir('fogo', 90 * F.int, dt, () => this.criar({ x: F.x + R() * F.w, y: F.y + R() * 10, vx: (R() - 0.5) * 20, vy: -50 - R() * 90 * F.int, s: (8 + R() * 14) * Math.max(0.6, F.int), m: 0.5 + R() * 0.7, fogo: true }));
      this.emitir('brasa', 20 * F.int, dt, () => this.criar({ x: F.x + R() * F.w, y: F.y, vx: (R() - 0.5) * 40, vy: -60 - R() * 120, s: 2 + R() * 2, m: 1.5 + R() * 2, c: '255,150,60' }));
    }
    const cx = this.ctx;
    cx.clearRect(0, 0, 1280, 720);
    for (let i = this.P.length - 1; i >= 0; i--) {
      const p = this.P[i];
      p.l += dt;
      if (p.l >= p.m) {
        this.P.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.l / p.m;
      let a = p.a * Math.min(1, k * 6) * (1 - k);
      if (p.pisca) a *= 0.5 + 0.5 * Math.sin(p.l * 12 + p.x);
      if (p.cinza) {
        cx.globalCompositeOperation = 'source-over';
        cx.fillStyle = `rgba(${p.c},${a.toFixed(3)})`;
        cx.save();
        cx.translate(p.x, p.y);
        cx.rotate(p.l * (p.rot || 1));
        cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        cx.restore();
        continue;
      }
      const c = p.fogo ? (k < 0.3 ? '255,225,140' : k < 0.6 ? '255,140,40' : '190,40,10') : p.c;
      const sz = p.fogo ? p.s * (1 - k * 0.6) : p.s;
      cx.globalCompositeOperation = 'lighter';
      cx.globalAlpha = Math.max(0, a);
      cx.drawImage(this.sprite(c), p.x - sz * 2, p.y - sz * 2, sz * 4, sz * 4);
      cx.globalAlpha = 1;
    }
    cx.globalCompositeOperation = 'source-over';
    this.luz.style.opacity = (0.85 + Math.sin(agora / 170) * 0.05 + Math.sin(agora / 53) * 0.04 + (F ? F.int * 0.12 : 0)).toFixed(3);
    requestAnimationFrame(t => this.quadro(t));
  }
}
