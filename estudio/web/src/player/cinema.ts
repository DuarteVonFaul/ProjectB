import type { Faixa, Ilustracao, Movimento, Passo, Plano } from '../core/tipos';
import { aplicarMixagem, audio, musica, sfx, sons, sonsAtivosAntes } from './audio';
import { narrador } from './narrador';
import { manchas } from './paginas';
import { Particulas } from './particulas';
import type { EventosPlayer } from './player';
import './cinema.css';

const CANCELADO = Symbol('cancelado');
type Mostrar = Extract<Passo, { tipo: 'mostrar' }>;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Quadros-chave de cada movimento de câmera (escala e deslocamento em %). */
function quadros(m: Movimento): Keyframe[] {
  const t = (s: number, x = 0, y = 0) => ({ transform: `translate(${x}%, ${y}%) scale(${s})` });
  switch (m) {
    case 'aproximar': return [t(1.04), t(1.22)];
    case 'afastar': return [t(1.24), t(1.04)];
    case 'esquerda': return [t(1.16, 4), t(1.16, -4)];
    case 'direita': return [t(1.16, -4), t(1.16, 4)];
    case 'subir': return [t(1.16, 0, 4), t(1.16, 0, -4)];
    case 'descer': return [t(1.16, 0, -4), t(1.16, 0, 4)];
    case 'aproximarRapido': return [t(1.0), t(1.32)];
    default: return [t(1.06), t(1.06)];
  }
}

/** Executa um plano no formato cinematográfico: imagem em tela cheia com câmera, cortes e legendas. */
export class PlayerCinema {
  private plano: Plano | null = null;
  private tok: { parado: boolean } = { parado: true };
  private el: Record<string, HTMLElement> = {};
  private fx: Particulas;
  private ro: ResizeObserver;
  private camadas: HTMLElement[] = [];
  private frente = 0;
  private animCamera: Animation | null = null;
  /** Na exportação as legendas vão queimadas no vídeo, fora do quadro. */
  semLegenda = false;

  constructor(private host: HTMLElement, private ev: EventosPlayer = {}) {
    host.innerHTML = `
<div class="pc-palco">
 <div class="pc-camada"><div class="pc-imagem"></div></div>
 <div class="pc-camada"><div class="pc-imagem"></div></div>
 <div class="pc-vinheta"></div>
 <div class="pc-sangue"></div>
 <canvas class="pc-fx" width="1280" height="720"></canvas>
 <div class="pc-clarao"></div>
 <div class="pc-veu"></div>
 <div class="pc-titulo"><div class="pc-titulo-t"></div><div class="pc-titulo-s"></div></div>
 <div class="pc-legenda"></div>
 <div class="pc-fim">Fim</div>
 <div class="pc-luz"></div>
</div>`;
    const q = (c: string) => host.querySelector('.' + c) as HTMLElement;
    for (const c of ['pc-palco', 'pc-sangue', 'pc-clarao', 'pc-veu', 'pc-titulo', 'pc-titulo-t', 'pc-titulo-s', 'pc-legenda', 'pc-fim', 'pc-luz']) this.el[c.slice(3)] = q(c);
    this.camadas = [...host.querySelectorAll<HTMLElement>('.pc-camada')];
    this.fx = new Particulas(q('pc-fx') as HTMLCanvasElement, this.el.luz);
    this.fx.areaBrilho = [0, 0, 1280, 720];
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

  carregar(plano: Plano) {
    this.parar();
    this.plano = plano;
    this.preparar(1);
  }

  // ---------- conteúdo ----------
  private conteudo(il: Ilustracao) {
    if (il.fonte === 'imagem' && il.src) return `<img src="${esc(il.src)}" alt="">`;
    if (il.fonte === 'svg' && il.svg?.trim().startsWith('<svg'))
      return il.svg.trim().replace(/\spreserveAspectRatio="[^"]*"/, '').replace(/^<svg/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice"');
    return `<div class="pc-esboco"><div class="pc-esboco-r">Storyboard</div><p>${esc(il.descricao || 'Plano sem ilustração')}</p></div>`;
  }

  private preencher(camada: HTMLElement, m: Mostrar) {
    const img = camada.firstElementChild as HTMLElement;
    img.innerHTML = this.conteudo(m.ilustracao);
    img.style.filter = [m.escura ? 'brightness(.62) contrast(1.12) saturate(.85)' : '', m.desfocada ? 'blur(12px)' : ''].filter(Boolean).join(' ');
    img.getAnimations().forEach(a => a.cancel());
    img.style.transform = '';
  }

  private moverCamera(m: Movimento, duracao?: number) {
    const img = this.camadas[this.frente].firstElementChild as HTMLElement;
    const atual = getComputedStyle(img).transform;
    const k = quadros(m);
    // Continua de onde a câmera está (a posição atual já foi lida acima).
    if (atual && atual !== 'none') k[0] = { transform: atual };
    img.getAnimations().forEach(a => a.cancel());
    const dur = (duracao ?? (m === 'aproximarRapido' ? 1.4 : 16)) * 1000;
    this.animCamera = img.animate(k, { duration: dur, easing: m === 'aproximarRapido' ? 'cubic-bezier(.3,0,.2,1)' : 'ease-in-out', fill: 'forwards' });
  }

  private veu(cor: 'preto' | 'branco', ate: number, ms: number) {
    const v = this.el.veu;
    v.style.background = cor === 'branco' ? '#fff' : '#000';
    const de = parseFloat(getComputedStyle(v).opacity) || 0;
    v.getAnimations().forEach(a => a.cancel());
    const a = v.animate([{ opacity: de }, { opacity: ate }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
    return a.finished.then(() => { v.style.opacity = String(ate); a.cancel(); });
  }

  // ---------- preparar / tocar / parar ----------
  private preparar(n: number) {
    this.camadas.forEach(c => { c.style.opacity = '0'; c.getAnimations().forEach(a => a.cancel()); (c.firstElementChild as HTMLElement).innerHTML = ''; });
    this.el.sangue.innerHTML = '';
    this.el.veu.getAnimations().forEach(a => a.cancel());
    this.el.veu.style.opacity = '1';
    this.el.veu.style.background = '#000';
    this.el.titulo.style.opacity = '0';
    this.el.legenda.style.opacity = '0';
    this.el.fim.style.opacity = '0';
    this.fx.limpar();
    let ultimo: Mostrar | null = null, escuro = true, fogo: number | null = null;
    const faixas = new Set<Faixa>();
    for (const c of this.plano?.cenas ?? []) {
      if (c.numero >= n) break;
      for (const p of c.passos) {
        if (p.tipo === 'mostrar') { ultimo = p; escuro = false; }
        if (p.tipo === 'escurecer') escuro = true;
        if (p.tipo === 'musica') p.acao === 'tocar' ? faixas.add(p.faixa) : faixas.delete(p.faixa);
        if (p.tipo === 'efeito' && p.efeito === 'fogo') fogo = p.intensidade ?? 0.5;
        if (p.tipo === 'efeito' && p.efeito === 'apagarFogo') fogo = null;
      }
    }
    if (ultimo) {
      this.frente = 0;
      this.preencher(this.camadas[0], ultimo);
      this.camadas[0].style.opacity = '1';
      if (!escuro) this.el.veu.style.opacity = '0';
    }
    return { faixas, fogo };
  }

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
    if (estado.fogo) this.fx.fogo = { x: 0, y: 735, w: 1280, int: Math.min(estado.fogo, 0.6) };
    try {
      for (const c of this.plano.cenas) {
        if (c.numero < desde) continue;
        this.ev.onCena?.(c.numero);
        for (const p of c.passos) await this.executar(p);
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
  private async executar(p: Passo) {
    switch (p.tipo) {
      case 'mostrar': return this.mostrar(p);
      case 'camera': this.moverCamera(p.movimento, p.duracao); return;
      case 'tremor': this.tremer(p.intensidade ?? 1); return;
      case 'titulo': return this.titulo(p.texto, p.subtitulo);
      case 'escurecer': return this.guarda(this.veu(p.cor ?? 'preto', 1, (p.duracao ?? 1.5) * 1000));
      case 'narrar': return this.narrar(p.texto, p.velocidade, p.personagem, p.estilo);
      case 'pausa': return this.esperar(p.ms);
      case 'musica':
        if (p.acao === 'tocar') musica.tocar(p.faixa, p.fade ?? 2, p.volume ?? 1);
        else musica.parar(p.faixa, p.fade ?? 2);
        return;
      case 'som':
        void sons.tocar(p);
        return;
      case 'musicaAjuste': musica.ajustar(p.faixa, p); return;
      case 'efeito': return this.efeito(p.efeito, p.intensidade ?? 1);
      default: return; // passos do livro não se aplicam aqui
    }
  }

  private async mostrar(m: Mostrar) {
    const trans = m.transicao ?? 'fusao';
    const velha = this.camadas[this.frente];
    const nova = this.camadas[1 - this.frente];
    const veuAberto = parseFloat(getComputedStyle(this.el.veu).opacity) > 0.5;
    this.preencher(nova, m);
    this.el.sangue.innerHTML = '';
    nova.style.zIndex = '2';
    velha.style.zIndex = '1';

    if (trans === 'preto' || trans === 'branco') {
      if (!veuAberto) await this.guarda(this.veu(trans, 1, 450));
      nova.style.opacity = '1';
      velha.style.opacity = '0';
      this.frente = 1 - this.frente;
      this.moverCamera(m.movimento ?? 'parado');
      await this.guarda(this.veu(trans, 0, 900));
      return;
    }
    if (veuAberto) this.veu('preto', 0, 700);
    this.frente = 1 - this.frente;
    this.moverCamera(m.movimento ?? 'parado');
    if (trans === 'corte') {
      nova.style.opacity = '1';
      velha.style.opacity = '0';
      if (velha.firstElementChild) sfx.pagina(true);
      return;
    }
    if (trans === 'deslize') {
      nova.style.opacity = '1';
      const o: KeyframeAnimationOptions = { duration: 900, easing: 'cubic-bezier(.6,0,.3,1)' };
      velha.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], o);
      await this.guarda(nova.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], o).finished);
      velha.style.opacity = '0';
      return;
    }
    // fusão
    const a = nova.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1300, easing: 'ease-in-out', fill: 'forwards' });
    await this.guarda(a.finished);
    nova.style.opacity = '1';
    a.cancel();
    velha.style.opacity = '0';
  }

  private tremer(int: number) {
    const k = Array.from({ length: 14 }, (_, i) => ({ translate: i === 13 ? '0 0' : `${(Math.random() - 0.5) * 28 * int}px ${(Math.random() - 0.5) * 20 * int}px` }));
    this.el.palco.animate(k, { duration: 900, easing: 'linear' });
  }

  private async titulo(texto: string, sub?: string) {
    const { titulo } = this.el;
    this.el['titulo-t'].textContent = texto;
    this.el['titulo-s'].textContent = sub ?? '';
    await this.guarda(this.veu('preto', 1, 500));
    await this.guarda(titulo.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 1100, fill: 'forwards' }).finished);
    await this.esperar(2200);
    await this.guarda(titulo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, fill: 'forwards' }).finished);
  }

  private efeito(e: string, int: number) {
    if (e === 'sangue') {
      sfx.respingo();
      this.el.sangue.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 1280 720" width="1280" height="720">${manchas(Math.floor(Math.random() * 1e6), Math.round(2 + 1.5 * int), 0.9 + 0.35 * int, true, [40, 30, 1240, 690])}</svg>`);
    } else if (e === 'fogo') {
      this.fx.fogo = { x: 0, y: 735, w: 1280, int: int > 1 ? int * 1.2 : int };
    } else if (e === 'apagarFogo') {
      this.fx.fogo = null;
    } else if (e === 'brilho') {
      this.fx.brilho = int * 8;
    } else if (e === 'perfurar') {
      sfx.perfurar();
    } else if (e === 'focar') {
      const img = this.camadas[this.frente].firstElementChild as HTMLElement;
      img.style.transition = 'filter 2.6s ease';
      img.style.filter = img.style.filter.replace(/blur\([^)]*\)/, 'blur(0px)');
    } else if (e === 'clarao') {
      sfx.explosao();
      this.el.clarao.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 2600, easing: 'ease-out' });
      this.tremer(1.3);
    } else if (e === 'fim') {
      this.veu('preto', 1, 2500);
      this.el.fim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 2500, delay: 800, fill: 'forwards' });
    }
  }

  private async narrar(texto: string, velocidade = 1, personagem?: string, estilo?: string) {
    const tok = this.tok;
    const rate = 0.92 * velocidade, est = (texto.length * 62) / rate, t0 = performance.now();
    const nome = personagem?.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    const leg = this.el.legenda;
    leg.className = `pc-legenda pc-${estilo ?? 'narracao'}`;
    leg.innerHTML = (nome ? `<b>${esc(nome)}</b>` : '') + `<span>${esc(texto)}</span>`;
    leg.style.opacity = this.semLegenda ? '0' : '1';
    const gravada = !!narrador.bufferDe(texto, personagem, velocidade);
    this.ev.onFala?.({ texto, personagem, estilo, inicio: performance.now() });
    await narrador.falar(texto, rate, undefined, personagem, velocidade);
    if (tok.parado) throw CANCELADO;
    this.ev.onFalaFim?.(performance.now());
    const passou = performance.now() - t0;
    if (!gravada && passou < est * 0.5) await this.esperar(est - passou);
    leg.style.opacity = '0';
    await this.esperar(150);
  }
}
