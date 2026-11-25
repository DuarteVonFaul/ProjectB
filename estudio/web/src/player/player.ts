import type { Faixa, Pagina, Passo, Plano } from '../core/tipos';
import { aplicarMixagem, audio, musica, sfx, sons, sonsAtivosAntes } from './audio';
import { narrador } from './narrador';
import { desenharPagina, manchas } from './paginas';
import { Particulas } from './particulas';
import './player.css';

const CANCELADO = Symbol('cancelado');
const VEL = { lenta: 2400, normal: 1200, rapida: 550, relampago: 260 } as const;

export interface EventosPlayer {
  onCena?: (n: number) => void;
  onEstado?: (tocando: boolean) => void;
  /** Início e fim de cada fala (usado na exportação para as legendas). */
  onFala?: (f: { texto: string; personagem?: string; estilo?: string; inicio: number }) => void;
  onFalaFim?: (fim: number) => void;
}

/** Executa um Plano de animação no formato "livro antigo". */
export class Player {
  private plano: Plano | null = null;
  private tok: { parado: boolean } = { parado: true };
  private el: Record<string, HTMLElement> = {};
  private fx: Particulas;
  private ro: ResizeObserver;
  private cenaAtual = 0;

  constructor(private host: HTMLElement, private ev: EventosPlayer = {}) {
    host.innerHTML = `
<div class="ep-palco">
 <div class="ep-luz"></div>
 <div class="ep-livro">
  <div class="ep-base"></div>
  <div class="ep-paginas">
   <div class="pg l ep-L"></div><div class="pg r ep-R"></div>
   <div class="ep-folha"><div class="face pg r ep-folhaF"></div><div class="face back pg l ep-folhaV"></div></div>
   <div class="ep-carvao"></div>
  </div>
  <div class="ep-capa"><div class="face ep-capaF"><div class="ep-titulo"></div><div class="ep-emblema"></div><div class="ep-sub"></div></div><div class="face back pg l ep-capaV"></div></div>
 </div>
 <canvas class="ep-fx" width="1280" height="720"></canvas>
 <div class="ep-legenda"></div>
 <div class="ep-clarao"></div>
 <div class="ep-fim">Fim</div>
</div>`;
    const q = (c: string) => host.querySelector('.' + c) as HTMLElement;
    for (const c of ['ep-palco', 'ep-luz', 'ep-livro', 'ep-base', 'ep-paginas', 'ep-L', 'ep-R', 'ep-folha', 'ep-folhaF', 'ep-folhaV', 'ep-carvao', 'ep-capa', 'ep-capaV', 'ep-titulo', 'ep-sub', 'ep-legenda', 'ep-fim', 'ep-emblema', 'ep-clarao'])
      this.el[c.slice(3)] = q(c);
    this.el.emblema.innerHTML = `<svg width="130" height="130" viewBox="-75 -75 150 150"><g fill="none" stroke="#c99a3e" stroke-width="2"><circle cx="0" cy="-18" r="30"/><circle cx="-18" cy="12" r="30"/><circle cx="18" cy="12" r="30"/><circle r="62" stroke-width="1.2"/></g><path d="M0,-14 L10,2 L0,18 L-10,2Z" fill="#7fd0de" stroke="#c99a3e" stroke-width="1.5"/></svg>`;
    this.fx = new Particulas(q('ep-fx') as HTMLCanvasElement, this.el.luz);
    this.ro = new ResizeObserver(() => this.ajustar());
    this.ro.observe(host);
    this.ajustar();
  }

  destruir() {
    this.parar();
    this.fx.destruir();
    this.ro.disconnect();
    this.host.innerHTML = '';
  }

  private ajustar() {
    const s = Math.min(this.host.clientWidth / 1280, this.host.clientHeight / 720) || 0.5;
    this.el.palco.style.transform = `scale(${s})`;
  }

  // ---------- carregar / preparar ----------
  carregar(plano: Plano) {
    this.parar();
    this.plano = plano;
    this.preparar(1);
  }

  private cabecalho(_n: number) {
    const t = this.plano?.titulo ?? '';
    return `<div class="hd"><div class="ch">${t.replace(/</g, '&lt;')}</div><div class="orn">❦</div></div><div class="txt"></div>`;
  }

  /** Coloca o livro no estado em que estaria no início da cena n (para pular cenas). */
  private preparar(n: number) {
    const { livro, capa, base, folha, paginas, L, R, carvao, legenda, fim } = this.el;
    [livro, capa, base, folha].forEach(e => e.getAnimations().forEach(a => a.cancel()));
    paginas.querySelectorAll('.ep-rasgo').forEach(e => e.remove());
    this.mascara('');
    carvao.style.display = 'none';
    folha.style.display = 'none';
    legenda.style.opacity = '0';
    fim.style.opacity = '0';
    this.fx.limpar();
    this.el.titulo.textContent = (this.plano?.titulo ?? '').split(/[-–:]/)[0].trim().toUpperCase() || 'HISTÓRIA';
    this.el.sub.textContent = (this.plano?.titulo ?? '').split(/[-–:]/).slice(1).join(' · ').trim();

    let aberto = false, queimado = false, pagina: Pagina | null = null, cenaPagina = 1, fogo: number | null = null;
    const faixas = new Set<Faixa>();
    for (const c of this.plano?.cenas ?? []) {
      if (c.numero >= n) break;
      for (const p of c.passos) {
        if (p.tipo === 'abrirLivro') { aberto = true; pagina = p.pagina; cenaPagina = c.numero; }
        if (p.tipo === 'fecharLivro') aberto = false;
        if ((p.tipo === 'virarPagina' || p.tipo === 'rasgarPagina' || p.tipo === 'surgirDasCinzas') && 'pagina' in p) {
          pagina = p.pagina; queimado = false; if (p.tipo !== 'virarPagina' || !p.manterTexto) cenaPagina = c.numero;
        }
        if (p.tipo === 'queimarPaginas') queimado = true;
        if (p.tipo === 'musica') p.acao === 'tocar' ? faixas.add(p.faixa) : faixas.delete(p.faixa);
        if (p.tipo === 'efeito' && p.efeito === 'fogo') fogo = p.intensidade ?? 0.5;
        if (p.tipo === 'efeito' && p.efeito === 'apagarFogo') fogo = null;
      }
    }
    if (!aberto) {
      capa.style.display = 'block';
      capa.style.transform = 'translateZ(2px) rotateY(0deg)';
      livro.style.transform = 'translateX(-220px)';
      base.style.clipPath = 'inset(0 0 0 50%)';
      L.style.visibility = 'hidden';
      L.innerHTML = '';
      R.innerHTML = desenharPagina(null);
    } else {
      capa.style.display = 'none';
      livro.style.transform = 'translateX(0px)';
      base.style.clipPath = 'inset(0 0 0 0%)';
      L.style.visibility = 'visible';
      L.innerHTML = this.cabecalho(cenaPagina);
      R.innerHTML = desenharPagina(pagina);
      if (queimado) this.mascara('linear-gradient(transparent,transparent)');
    }
    return { faixas, fogo };
  }

  // ---------- tocar / parar ----------
  async tocar(desde = 1) {
    if (!this.plano) return;
    this.parar();
    await new Promise(r => setTimeout(r, 60));
    const tok: { parado: boolean } = { parado: false };
    this.tok = tok;
    audio().resume();
    this.ev.onEstado?.(true); // já mostra "Parar" enquanto os sons carregam
    // Baixa antes os arquivos de som do plano: nada (nem a música) começa até eles estarem prontos.
    await sons.preCarregar(this.plano.cenas.flatMap(c => c.passos));
    if (tok.parado) return;
    const estado = this.preparar(desde);
    aplicarMixagem(this.plano.mixagem);
    estado.faixas.forEach(f => musica.tocar(f, 1.5));
    sonsAtivosAntes(this.plano.cenas, desde).forEach(p => void sons.tocar(p));
    if (estado.fogo) this.fx.fogo = { x: 220, y: 655, w: 860, int: Math.min(estado.fogo, 0.5) };
    try {
      for (const c of this.plano.cenas) {
        if (c.numero < desde) continue;
        this.cenaAtual = c.numero;
        this.ev.onCena?.(c.numero);
        for (const p of c.passos) await this.executar(p, c.numero);
      }
    } catch (e) {
      if (e !== CANCELADO) console.error(e);
    } finally {
      if (this.tok === tok) {
        tok.parado = true;
        this.ev.onEstado?.(false);
      }
    }
  }

  parar() {
    if (!this.tok.parado) {
      this.tok.parado = true;
      this.ev.onEstado?.(false);
    }
    narrador.cancelar();
    musica.pararTodas(0.4);
    sons.pararTodos(0.4);
    this.fx.brilho = 0;
    this.fx.fogo = null;
    this.el.legenda.style.opacity = '0';
  }

  private guarda<T>(p: Promise<T>): Promise<T> {
    const t = this.tok;
    return p.then(
      v => { if (t.parado) throw CANCELADO; return v; },
      e => { if (t.parado) throw CANCELADO; throw e; },
    );
  }
  private esperar(ms: number) {
    return this.guarda(new Promise<void>(r => setTimeout(r, ms)));
  }

  // ---------- passos ----------
  private async executar(p: Passo, cena: number) {
    switch (p.tipo) {
      case 'abrirLivro': return this.abrir(p.pagina, cena);
      case 'fecharLivro': return this.fechar();
      case 'virarPagina': return this.virar(p.pagina, cena, VEL[p.velocidade ?? 'normal'], !!p.manterTexto);
      case 'rasgarPagina': return this.rasgar(p.pagina);
      case 'queimarPaginas': return this.queimar(4300);
      case 'surgirDasCinzas': return this.surgir(p.pagina, cena);
      case 'narrar': return this.narrar(p.texto, p.velocidade, p.legenda, p.personagem, p.estilo);
      case 'pausa': return this.esperar(p.ms);
      case 'musica':
        if (p.acao === 'tocar') musica.tocar(p.faixa, p.fade ?? 2, p.volume ?? 1);
        else musica.parar(p.faixa, p.fade ?? 2);
        return;
      case 'som':
        void sons.tocar(p);
        return;
      case 'musicaAjuste':
        musica.ajustar(p.faixa, p);
        return;
      case 'efeito':
        return this.efeito(p.efeito, p.intensidade ?? 1);
    }
  }

  private efeito(e: string, int: number) {
    const { R } = this.el;
    if (e === 'sangue') {
      sfx.respingo();
      const svg = R.querySelector('svg');
      if (!svg) return;
      svg.insertAdjacentHTML('beforeend', manchas(Math.floor(Math.random() * 1e6), Math.round(4 * int), 0.8 + 0.3 * int, true));
      const g = svg.lastElementChild!;
      setTimeout(() => g.querySelectorAll('.respingo,.pingo').forEach(x => x.classList.remove('respingo', 'pingo')), 3800);
    } else if (e === 'fogo') {
      this.fx.fogo = int > 1 ? { x: 220, y: 640, w: 860, int } : { x: 650, y: 640, w: 420, int };
    } else if (e === 'apagarFogo') {
      this.fx.fogo = null;
    } else if (e === 'brilho') {
      this.fx.brilho = int * 6;
    } else if (e === 'perfurar') {
      sfx.perfurar();
    } else if (e === 'focar') {
      this.focar(2600);
    } else if (e === 'clarao') {
      sfx.explosao();
      this.el.clarao.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 2600, easing: 'ease-out' });
      this.el.palco.animate(
        Array.from({ length: 14 }, (_, k) => ({ translate: k === 13 ? '0 0' : `${(Math.random() - 0.5) * 26}px ${(Math.random() - 0.5) * 18}px` })),
        { duration: 900, easing: 'linear' },
      );
    } else if (e === 'fim') {
      this.el.fim.style.opacity = '1';
    }
  }

  // ---------- livro ----------
  private tinta(raiz: HTMLElement, total = 2.6) {
    const els = [...raiz.querySelectorAll<SVGGeometryElement>('path,line,circle,ellipse,rect,polyline,polygon,text,image')].filter(
      e => !e.closest('.semtinta') && !e.closest('defs'),
    );
    const lista: [SVGElement, boolean][] = [];
    for (const e of els) {
      const cs = getComputedStyle(e);
      const temTraco = cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0 && cs.strokeDasharray === 'none';
      let len = 0;
      if (temTraco && 'getTotalLength' in e) try { len = e.getTotalLength(); } catch { /* ignore */ }
      if (len > 0) {
        e.style.strokeDasharray = String(len);
        e.style.strokeDashoffset = String(len);
        if (cs.fill !== 'none') e.style.fillOpacity = '0';
        lista.push([e, true]);
      } else {
        e.style.opacity = '0';
        lista.push([e, false]);
      }
    }
    return {
      ir() {
        void raiz.offsetWidth;
        const n = lista.length || 1;
        lista.forEach(([e, traco], i) => {
          const d = Math.max(0.4, total * 0.45), dl = (i / n) * total * 0.6;
          if (traco) {
            e.style.transition = `stroke-dashoffset ${d}s ease-in-out ${dl}s, fill-opacity ${d * 0.8}s ease ${dl + d * 0.5}s`;
            e.style.strokeDashoffset = '0';
            e.style.fillOpacity = '';
          } else {
            e.style.transition = `opacity ${d}s ease ${dl}s`;
            e.style.opacity = '';
          }
        });
        setTimeout(() => lista.forEach(([e]) => {
          e.style.transition = e.style.strokeDasharray = e.style.strokeDashoffset = e.style.opacity = e.style.fillOpacity = '';
        }), (total * 1.15 + 0.3) * 1000);
      },
    };
  }

  private async abrir(pagina: Pagina, cena: number) {
    const { capa, livro, base, L, R, capaV } = this.el;
    R.innerHTML = desenharPagina(pagina);
    const tinta = this.tinta(R, 3.4);
    capaV.innerHTML = this.cabecalho(cena);
    capa.style.display = 'block';
    L.style.visibility = 'hidden';
    sfx.abrir();
    const o: KeyframeAnimationOptions = { duration: 2000, easing: 'cubic-bezier(.5,.05,.3,1)', fill: 'forwards' };
    // translateZ: a capa gira sempre um pouco à frente das páginas (sem "briga" de planos, que fazia piscar).
    const a1 = capa.animate([{ transform: 'translateZ(2px) rotateY(0deg)' }, { transform: 'translateZ(2px) rotateY(-180deg)' }], o);
    const a2 = livro.animate([{ transform: 'translateX(-220px)' }, { transform: 'translateX(0px)' }], o);
    const a3 = base.animate([{ clipPath: 'inset(0 0 0 50%)' }, { clipPath: 'inset(0 0 0 0%)' }], o);
    setTimeout(() => tinta.ir(), 600);
    setTimeout(() => { L.innerHTML = capaV.innerHTML; L.style.visibility = 'visible'; }, 1000);
    await this.guarda(a1.finished);
    L.innerHTML = capaV.innerHTML;
    capa.style.display = 'none';
    livro.style.transform = 'translateX(0px)';
    base.style.clipPath = 'inset(0 0 0 0%)';
    [a1, a2, a3].forEach(a => a.cancel());
    this.fx.brilho = 5;
  }

  private async fechar() {
    const { capa, capaV, livro, base, L } = this.el;
    capaV.innerHTML = L.innerHTML;
    capa.style.display = 'block';
    this.fx.brilho = 0;
    const o: KeyframeAnimationOptions = { duration: 2200, easing: 'cubic-bezier(.5,.05,.3,1)', fill: 'forwards' };
    const a1 = capa.animate([{ transform: 'translateZ(2px) rotateY(-180deg)' }, { transform: 'translateZ(2px) rotateY(0deg)' }], o);
    const a2 = livro.animate([{ transform: 'translateX(0px)' }, { transform: 'translateX(-220px)' }], o);
    const a3 = base.animate([{ clipPath: 'inset(0 0 0 0%)' }, { clipPath: 'inset(0 0 0 50%)' }], o);
    setTimeout(() => (L.style.visibility = 'hidden'), 1100);
    setTimeout(() => sfx.fechar(), 2000);
    await this.guarda(a1.finished);
    capa.style.transform = 'translateZ(2px) rotateY(0deg)';
    livro.style.transform = 'translateX(-220px)';
    base.style.clipPath = 'inset(0 0 0 50%)';
    [a1, a2, a3].forEach(a => a.cancel());
  }

  private async virar(pagina: Pagina, cena: number, dur: number, manterTexto: boolean) {
    const { L, R, folha, folhaF, folhaV } = this.el;
    const novaEsq = manterTexto ? L.innerHTML : this.cabecalho(cena);
    folhaF.innerHTML = R.innerHTML;
    folhaV.innerHTML = novaEsq;
    R.innerHTML = desenharPagina(pagina);
    const tinta = dur > 300 ? this.tinta(R, dur < 700 ? 1.2 : 2.6) : null;
    folha.style.display = 'block';
    sfx.pagina(dur < 700);
    const a = folha.animate([{ transform: 'translateZ(2px) rotateY(0deg)' }, { transform: 'translateZ(2px) rotateY(-180deg)' }], { duration: dur, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
    if (tinta) setTimeout(() => tinta.ir(), dur * 0.45);
    await this.guarda(a.finished);
    L.innerHTML = novaEsq;
    folha.style.display = 'none';
    a.cancel();
  }

  private async rasgar(pagina: Pagina) {
    const { R, paginas } = this.el;
    const html = R.innerHTML;
    const pts: string[] = [];
    for (let y = 0; y <= 600; y += 30) pts.push(`${(220 + (pts.length % 2 ? 14 : -12) + Math.random() * 10 - 5).toFixed(0)}px ${y}px`);
    const parte = (clip: string) => {
      const d = document.createElement('div');
      d.className = 'pg r ep-rasgo';
      d.style.cssText = `z-index:7;transform-origin:50% 0;clip-path:polygon(${clip})`;
      d.innerHTML = html;
      paginas.appendChild(d);
      return d;
    };
    const pa = parte(`0 0,${pts.join(',')},0 600px`);
    const pb = parte(`${pts[0]},440px 0,440px 600px,${[...pts].reverse().join(',')}`);
    R.innerHTML = desenharPagina(pagina);
    sfx.rasgo();
    for (let i = 0; i < 40; i++)
      this.fx.criar({ cinza: true, x: 640 + 220 + (Math.random() - 0.5) * 30, y: 60 + Math.random() * 600, c: '225,205,165', s: 3 + Math.random() * 4, vx: (Math.random() - 0.5) * 80, vy: Math.random() * 40, g: 60, m: 1.6, rot: Math.random() * 6, a: 0.9 });
    const o: KeyframeAnimationOptions = { duration: 1150, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' };
    pa.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(-80px,190px) rotate(-14deg)', opacity: 0 }], o);
    const b = pb.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(120px,230px) rotate(16deg)', opacity: 0 }], o);
    try { await this.guarda(b.finished); } finally { pa.remove(); pb.remove(); }
  }

  private mascara(m: string) {
    const s = this.el.paginas.style as CSSStyleDeclaration & { webkitMaskImage: string };
    s.maskImage = m;
    s.webkitMaskImage = m;
  }

  private queimar(dur: number) {
    const tok = this.tok, ox = 700, oy = 520, max = 1050, t0 = performance.now();
    const { carvao } = this.el;
    carvao.style.display = 'block';
    sfx.sopro(dur / 1000);
    return this.guarda(new Promise<void>(res => {
      const f = (agora: number) => {
        if (tok.parado) return res();
        const k = Math.min(1, (agora - t0) / dur), r = Math.pow(k, 1.35) * max;
        this.mascara(`radial-gradient(circle at ${ox}px ${oy}px, transparent ${r}px, #000 ${r + 16}px)`);
        carvao.style.background = `radial-gradient(circle at ${ox}px ${oy}px, transparent ${r + 12}px, rgba(20,8,2,.95) ${r + 16}px, rgba(70,30,8,.75) ${r + 34}px, rgba(120,60,20,.28) ${r + 70}px, transparent ${r + 115}px)`;
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * 6.283, px = ox + Math.cos(a) * r, py = oy + Math.sin(a) * r;
          if (px > 0 && px < 880 && py > 0 && py < 600) {
            this.fx.criar({ x: 200 + px, y: 60 + py, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 90, s: 7 + Math.random() * 10, m: 0.5 + Math.random() * 0.6, fogo: true });
            if (Math.random() < 0.5) this.fx.criar({ cinza: true, x: 200 + px, y: 60 + py, c: '50,44,40', s: 3 + Math.random() * 5, vx: (Math.random() - 0.5) * 40, vy: -30 + Math.random() * 20, g: 40, m: 2.5, rot: Math.random() * 5, a: 0.85 });
          }
        }
        if (k < 1) requestAnimationFrame(f);
        else {
          carvao.style.display = 'none';
          this.fx.fogo = { x: 220, y: 655, w: 860, int: 0.35 };
          res();
        }
      };
      requestAnimationFrame(f);
    }));
  }

  private surgir(pagina: Pagina, cena: number) {
    const tok = this.tok, t0 = performance.now(), dur = 2800;
    const { L, R, carvao } = this.el;
    L.innerHTML = this.cabecalho(cena);
    // O que foi dito em legenda (sobre as cinzas) passa a constar na nova página.
    const txt = L.querySelector('.txt');
    const dito = this.el.legenda.dataset.texto;
    if (txt && dito) txt.innerHTML = `<p>${dito.split(' ').map(w => `<span class="on">${w.replace(/</g, '&lt;')}</span>`).join(' ')}</p>`;
    this.el.legenda.dataset.texto = '';
    R.innerHTML = desenharPagina(pagina);
    carvao.style.display = 'none';
    this.fx.fogo = null;
    return this.guarda(new Promise<void>(res => {
      const f = (agora: number) => {
        if (tok.parado) return res();
        const k = Math.min(1, (agora - t0) / dur), r = k * 820;
        this.mascara(`radial-gradient(circle at 440px 330px, #000 ${r}px, transparent ${r + 110}px)`);
        for (let i = 0; i < 3; i++)
          this.fx.criar({ cinza: true, x: 200 + Math.random() * 880, y: 360 + Math.random() * 300, c: '110,100,90', s: 2 + Math.random() * 4, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 40, m: 2.5, rot: Math.random() * 4, a: 0.6 });
        if (k < 1) requestAnimationFrame(f);
        else {
          this.mascara('');
          res();
        }
      };
      requestAnimationFrame(f);
    }));
  }

  private focar(dur: number) {
    const tok = this.tok, t0 = performance.now();
    const fe = this.el.R.querySelector('.desfoque');
    if (!fe) return;
    const ini = parseFloat(fe.getAttribute('stdDeviation') || '0');
    const f = (agora: number) => {
      if (tok.parado) return;
      const k = Math.min(1, (agora - t0) / dur);
      fe.setAttribute('stdDeviation', (ini * (1 - k)).toFixed(2));
      if (k < 1) requestAnimationFrame(f);
      else for (let i = 0; i < 40; i++) this.fx.criar({ x: 860, y: 330, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, s: 2 + Math.random() * 3, m: 0.8 + Math.random(), c: '140,235,255', pisca: true });
    };
    requestAnimationFrame(f);
  }

  // ---------- narração ----------
  private async narrar(texto: string, velocidade = 1, legenda = false, personagem?: string, estilo?: string) {
    const tok = this.tok;
    const rate = 0.92 * velocidade, est = (texto.length * 62) / rate, t0 = performance.now();
    let spans: HTMLElement[] = [];
    const inicios: number[] = [];
    let aceso = 0, temFronteira = false;
    const { legenda: leg, L } = this.el;
    if (legenda) {
      leg.textContent = texto;
      leg.dataset.texto = texto;
      leg.style.opacity = '1';
    } else {
      const box = L.querySelector('.txt');
      if (box) {
        const p = document.createElement('p');
        const palavras = texto.split(' ');
        let c = 0;
        palavras.forEach(w => { inicios.push(c); c += w.length + 1; });
        if (estilo) p.className = estilo;
        // Nome curto na página: "ORB (Orbital Reconnaissance Bot)" vira "ORB".
        const nome = personagem?.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
        p.innerHTML = (nome ? `<b class="quem">${nome.replace(/</g, '&lt;')}</b> ` : '') + palavras.map(w => `<span>${w.replace(/</g, '&lt;')}</span>`).join(' ');
        box.appendChild(p);
        spans = [...p.querySelectorAll('span')] as HTMLElement[];
        // Diálogos longos: tira os parágrafos mais antigos para o novo caber na página.
        while (L.scrollHeight > L.clientHeight + 2 && box.children.length > 1) box.firstElementChild!.remove();
      }
    }
    const acender = (n: number) => { for (; aceso < n && aceso < spans.length; aceso++) spans[aceso].classList.add('on'); };
    const iv = setInterval(() => { if (!temFronteira) acender(Math.ceil((spans.length * (performance.now() - t0)) / est)); }, 80);
    const gravada = !!narrador.bufferDe(texto, personagem, velocidade);
    await narrador.falar(texto, rate, ci => {
      temFronteira = true;
      let n = 0;
      while (n < inicios.length && inicios[n] <= ci) n++;
      acender(n);
    }, personagem, velocidade);
    clearInterval(iv);
    if (tok.parado) throw CANCELADO;
    const passou = performance.now() - t0;
    if (!gravada && passou < est * 0.5) await this.esperar(est - passou);
    acender(spans.length);
    if (legenda) leg.style.opacity = '0';
  }
}
