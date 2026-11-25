import type { CenaRoteiro, Faixa, Pagina, Passo, Plano, Roteiro, Segmento, Take } from './tipos';

/**
 * Diretor automático (sem IA): transforma o roteiro num plano de animação usando
 * pistas dos "Esquemas" (palavras como sangue, rasga, queima, perseguição, silêncio...).
 * É um ponto de partida editável; na Fase 2 o Claude assume esse papel.
 */

/** Remove acentos mantendo o mesmo comprimento (para os índices continuarem válidos). */
export const semAcento = (s: string) => [...s].map(c => c.normalize('NFD')[0]).join('').toLowerCase();

const FAIXAS: [RegExp, Faixa][] = [
  [/persegui/, 'perseguicao'],
  [/guerra|batalha|lutas?\b|perigo/, 'guerra'],
  [/agonia|tensao|suspense|tirar o folego/, 'agonia'],
  [/esperanca|alivio/, 'esperanca'],
  [/calma e leve|leve e calma|suave/, 'suave'],
  [/calma|fantasia|tranquil/, 'calma'],
];

/** Faixas citadas no texto do som, na ordem em que aparecem. */
export function faixasNoTexto(som: string): Faixa[] {
  const t = semAcento(som);
  const achados: { pos: number; faixa: Faixa }[] = [];
  for (const [re, faixa] of FAIXAS) {
    const g = new RegExp(re.source, 'g');
    for (const m of t.matchAll(g)) {
      if (faixa === 'calma' && achados.some(a => a.faixa === 'suave' && Math.abs(a.pos - m.index!) < 12)) continue;
      if (faixa === 'calma' && /esperanca/.test(t.slice(m.index!, m.index! + 60))) continue;
      achados.push({ pos: m.index!, faixa });
    }
  }
  achados.sort((a, b) => a.pos - b.pos);
  return achados.map(a => a.faixa).filter((f, i, arr) => i === 0 || arr[i - 1] !== f);
}

interface Ganchos {
  antes: Passo[];
  depois: Passo[];
}

class Agenda {
  private mapa = new Map<string, Ganchos>();
  get(chave: string): Ganchos {
    if (!this.mapa.has(chave)) this.mapa.set(chave, { antes: [], depois: [] });
    return this.mapa.get(chave)!;
  }
}

const paginaDe = (descricao: string, extras: Partial<Pagina> = {}): Pagina => {
  const d = descricao.trim().replace(/^[,.\s-]+|[,\s-]+$/g, '');
  const t = semAcento(d);
  const corte = t.search(/,?\s+e\s+(?:na parte inferior|logo embaixo|com uma arte inferior|abaixo|embaixo)|,?\s+e\s+logo\s+embaixo/);
  const base: Pagina =
    /superior|inferior|embaixo|abaixo/.test(t) && corte > 10
      ? { layout: 'dividida', ilustracoes: [ilus(d.slice(0, corte)), ilus(d.slice(corte).replace(/^,?\s*e\s+/i, ''))] }
      : { layout: 'inteira', ilustracoes: [ilus(d)] };
  if (/sangue/.test(t)) base.sangue = /mais fort|muito/.test(t) ? 2 : 1;
  if (/fogo|chamas|queimad/.test(t)) base.bordaQueimada = true;
  if (/escur|sombri|trev|lembranca|flashback|memoria/.test(t)) base.escura = true;
  if (/embacad|desfoc|borrad/.test(t)) base.desfocada = true;
  return { ...base, ...extras };
};

/** Remove um prefixo testando a regex no texto sem acento (mesmo comprimento). */
const tirarPrefixo = (s: string, re: RegExp) => {
  const m = re.exec(semAcento(s));
  return m && m.index === 0 ? s.slice(m[0].length) : s;
};

const ilus = (descricao: string) => {
  let d = descricao.trim();
  const prefixos = [
    /^(passa(ndo)? (rapidamente )?(mais uma vez )?a pagina|a pagina passa)\s*(agora\s*)?/,
    /^o livro se abre( formando imagens de)?\s*/,
    /^(com )?uma narracao acelerada\s*/,
    /^\s*(ilustrando|com|mostra|de)\s+/,
  ];
  for (let volta = 0; volta < 3; volta++) for (const re of prefixos) d = tirarPrefixo(d, re).trim();
  return { descricao: d ? d[0].toUpperCase() + d.slice(1) : descricao.trim(), fonte: 'esboco' as const };
};

/** Índices globais (na cena) de pausas e transições, para posicionar ganchos. */
function contarMarcas(takes: Take[]) {
  let p = 0;
  let tr = 0;
  return takes.map(t =>
    t.segmentos.map(s => (s.tipo === 'pausa' ? `pausa:${p++}` : s.tipo === 'transicao' ? `transicao:${tr++}` : '')),
  );
}

export function gerarPlano(roteiro: Roteiro): Plano {
  const estado = { livroAberto: false, musica: null as Faixa | null, queimado: false };
  const cenas = roteiro.cenas.map(c => ({ numero: c.numero, passos: dirigirCena(c, estado) }));
  const ultima = cenas[cenas.length - 1];
  if (ultima && !ultima.passos.some(p => p.tipo === 'fecharLivro')) ultima.passos.push({ tipo: 'fecharLivro' });
  if (ultima) {
    ultima.passos.push({ tipo: 'efeito', efeito: 'fim' });
    if (estado.musica) ultima.passos.push({ tipo: 'musica', faixa: estado.musica, acao: 'parar', fade: 6 });
  }
  return { versao: 1, titulo: roteiro.titulo || 'Sem título', geradoEm: new Date().toISOString(), origem: 'automatico', cenas };
}

function dirigirCena(c: CenaRoteiro, estado: { livroAberto: boolean; musica: Faixa | null; queimado: boolean }): Passo[] {
  const takes = c.falas.flatMap(f => f.takes);
  const donos = c.falas.flatMap(f => f.takes.map(() => f));
  if (!takes.length) takes.push({ numero: 1, segmentos: [] });
  const chaves = contarMarcas(takes);
  const ag = new Agenda();
  const anim = c.animacao.texto;
  const a = semAcento(anim);
  const som = semAcento(c.som.texto);
  const temPausa = chaves.flat().some(k => k.startsWith('pausa'));
  const temTrans = chaves.flat().some(k => k.startsWith('transicao'));
  const primeiraMarca = chaves.flat().find(Boolean);

  // ---------- Música ----------
  const faixas = faixasNoTexto(c.som.texto);
  const continua = /continua|permanece|mantem/.test(som);
  const trocar = (f: Faixa, onde: Passo[], fade = 2.5) => {
    if (estado.musica === f) return;
    if (estado.musica) onde.push({ tipo: 'musica', faixa: estado.musica, acao: 'parar', fade: Math.min(fade, 2) });
    onde.push({ tipo: 'musica', faixa: f, acao: 'tocar', fade });
    estado.musica = f;
  };
  const parar = (onde: Passo[], fade: number) => {
    if (estado.musica) onde.push({ tipo: 'musica', faixa: estado.musica, acao: 'parar', fade });
    estado.musica = null;
  };
  const somComecaNaPausa = /^\s*apos a pausa/.test(som) && temPausa;
  const inicio = ag.get('inicio');
  if (faixas.length && !(continua && estado.musica)) {
    if (somComecaNaPausa) trocar(faixas[0], ag.get('pausa:0').depois, 3);
    else trocar(faixas[0], inicio.antes);
  }
  if (/intensific/.test(som) && faixas[0]) {
    ag.get('meio').antes.push({ tipo: 'musicaAjuste', faixa: faixas[0], intensidade: 1.6 });
    ag.get('fim').antes.push({ tipo: 'musicaAjuste', faixa: faixas[0], intensidade: 2.1 });
  }
  if (/silencio/.test(som) && temTrans) {
    const tr = ag.get('transicao:0');
    if (/perfur|cortando|facada/.test(som)) tr.antes.push({ tipo: 'efeito', efeito: 'perfurar' });
    parar(tr.antes, 0.1);
    if (faixas.length > 1) {
      const destino = temPausa ? ag.get(chaves.flat().filter(k => k.startsWith('pausa')).pop()!).depois : tr.depois;
      destino.push({ tipo: 'pausa', ms: 1200 });
      destino.push({ tipo: 'musica', faixa: faixas[faixas.length - 1], acao: 'tocar', fade: 5, volume: 0.6 });
      estado.musica = faixas[faixas.length - 1];
    }
  }
  if (/para bruscamente|corta|interromp/.test(som)) {
    parar(ag.get('fim').depois, 0.08);
    if (/fogo/.test(som)) {
      ag.get('fim').depois.push({ tipo: 'musica', faixa: 'fogo', acao: 'tocar', fade: 0.3 });
      estado.musica = 'fogo';
    }
  }
  if (/pausa no final|pausa ao final/.test(som)) {
    if (estado.musica) ag.get('fim').antes.push({ tipo: 'musicaAjuste', faixa: estado.musica, volume: 0.35, duracao: 1.5 });
    ag.get('fim').depois.push({ tipo: 'pausa', ms: 2200 });
  }
  if (/acelerand/.test(som) && faixas[0] && takes.length > 1) {
    takes.forEach((t, i) => {
      if (i === 0) return;
      ag.get(`take:${t.numero}`).antes.push({ tipo: 'musicaAjuste', faixa: faixas[0], andamento: 128 + i * 22, intensidade: 1 + i * 0.2 });
    });
  }
  if (/volume aumentando|aumentando rapidamente|cresce/.test(som) && faixas[0]) {
    const ultimoTake = takes[takes.length - 1].numero;
    ag.get(`take:${ultimoTake}`).antes.push({ tipo: 'musicaAjuste', faixa: faixas[0], volume: 1.9, duracao: 4, andamento: 188 });
  }

  // ---------- Páginas e efeitos ----------
  const porTake = c.animacao.porTake;
  const usaPorTake = Object.keys(porTake).length > 0;
  const manterPagina = /cena passada|pagina atual|mesma pagina/.test(a);

  const virar = (pagina: Pagina, extras: Partial<Extract<Passo, { tipo: 'virarPagina' }>> = {}): Passo => {
    if (!estado.livroAberto) {
      estado.livroAberto = true;
      return { tipo: 'abrirLivro', pagina };
    }
    return { tipo: 'virarPagina', pagina, ...extras };
  };

  if (usaPorTake) {
    takes.forEach((t, i) => {
      const txt = porTake[t.numero] ?? '';
      const tt = semAcento(txt);
      const g = ag.get(`take:${t.numero}`);
      const rapida = /rapid/.test(tt);
      // Momento final do take (após a pausa / passada lenta)
      const mFinal = /apos a pausa,?\s*uma passada de pagina (\w+) para (.*?)(?: e encerra .*)?$/.exec(tt);
      const descPrincipal = mFinal ? txt.slice(0, mFinal.index) : txt;
      const mRapido = /,?\s*e com um passar de paginas rapido\s*/.exec(semAcento(descPrincipal));
      const principal = mRapido ? descPrincipal.slice(0, mRapido.index) : descPrincipal;
      const fimEncerra = semAcento(principal).search(/\s*e encerra /);
      g.antes.push(virar(paginaDe(fimEncerra > 0 ? principal.slice(0, fimEncerra) : principal), { velocidade: rapida && !mFinal ? 'rapida' : 'normal', manterTexto: i > 0 }));
      if (mRapido) {
        const keyTr = chaves[i].find(k => k.startsWith('transicao')) ?? `fim-take:${t.numero}`;
        const tr = ag.get(keyTr);
        let descFlip = descPrincipal.slice(mRapido.index + mRapido[0].length);
        const ate = semAcento(descFlip).search(/\s*ate chegar/);
        if (ate > 0) descFlip = descFlip.slice(0, ate);
        const flips: Passo[] = [];
        for (let k = 0; k < 3; k++)
          flips.push({ tipo: 'virarPagina', velocidade: 'relampago', manterTexto: true, pagina: paginaDe(descFlip, { sangue: k }) });
        tr.antes.unshift(...flips);
        if (/manchada com sangue|so sangue/.test(semAcento(descPrincipal))) {
          tr.antes.push({ tipo: 'virarPagina', velocidade: 'relampago', manterTexto: true, pagina: { layout: 'inteira', ilustracoes: [], sangue: 3 } });
        }
      }
      if (mFinal) {
        const keyP = chaves[i].filter(k => k.startsWith('pausa')).pop() ?? `fim-take:${t.numero}`;
        const vel = /lent/.test(mFinal[1]) ? 'lenta' : 'normal';
        const desc = txt.slice(mFinal.index + mFinal[0].indexOf(mFinal[2]), mFinal.index + mFinal[0].indexOf(mFinal[2]) + mFinal[2].length);
        ag.get(keyP).depois.push({ tipo: 'virarPagina', velocidade: vel, manterTexto: true, pagina: paginaDe(desc, { sangue: /sangue/.test(mFinal[2]) ? 1 : 0 }) });
      }
      if (/livro fech|fecha o livro|fechando/.test(tt)) ag.get('fim').depois.push({ tipo: 'fecharLivro' });
    });
  } else {
    // Divide a descrição em "antes" e "depois" (segunda página após pausa/transição).
    const reSegunda = /(?:assim mostrando a proxima pagina com|mostrando a proxima pagina com|apos a pausa,?\s*a pagina e passada com|depois da pausa,?\s*a pagina e passada com|embaixo das cinzas surge outra pagina|surge outra pagina)/;
    const mSeg = reSegunda.exec(a);
    const parte1 = mSeg ? anim.slice(0, mSeg.index) : anim;
    const parte2 = mSeg ? anim.slice(mSeg.index + mSeg[0].length) : '';
    const p1 = semAcento(parte1);
    const cinzas = /cinzas/.test(a) && estado.queimado;
    const rasgar = /rasga/.test(a);

    // Onde acontece a virada para a segunda página
    const ondeSegunda = takes.length > 1 ? `take:${takes[1].numero}` : rasgar && temTrans ? 'transicao:0' : primeiraMarca || 'meio';

    if (cinzas) {
      estado.queimado = false;
      inicio.antes.push({ tipo: 'efeito', efeito: 'apagarFogo' });
      const g = ag.get(primeiraMarca || 'inicio');
      g.depois.push({ tipo: 'surgirDasCinzas', pagina: paginaDe(parte2 || anim) });
    } else if (!anim.trim() && estado.livroAberto) {
      // Cena só de diálogo, sem descrição visual: mantém a página atual.
    } else if (!manterPagina || !estado.livroAberto) {
      inicio.antes.push(virar(paginaDe(cinzas ? parte2 : parte1.replace(/\s*,?\s*e no final da cena.*$/i, '').replace(/ainda meio .*$/i, ''), {
        desfocada: /embacad|desfoc/.test(p1),
        sangue: /sangue/.test(p1) && !/cria um efeito de sangue|efeitos? de sangue na pagina ficam/.test(p1) ? 1 : 0,
      })));
    }

    // Efeito de sangue na página atual
    if (/efeito de sangue|sangue na pagina|ficam mais fortes/.test(p1)) {
      const onde = /ao fim do take\s*1/.test(p1) && temPausa ? ag.get('pausa:0').antes : ag.get('meio').antes;
      onde.push({ tipo: 'efeito', efeito: 'sangue', intensidade: /mais fort/.test(p1) ? 2 : 1 });
    }
    if (/fogo/.test(p1) && !/queima/.test(p1)) ag.get('inicio').depois.push({ tipo: 'efeito', efeito: 'fogo', intensidade: 0.4 });
    if (/(mais visivel|fica nitid|ganha foco|maior foco)/.test(p1) && temPausa) ag.get('pausa:0').depois.push({ tipo: 'efeito', efeito: 'focar' });

    if (parte2 && !cinzas) {
      const pg = paginaDe(parte2);
      const passo: Passo = rasgar ? { tipo: 'rasgarPagina', pagina: pg } : { tipo: 'virarPagina', pagina: pg };
      const g = ag.get(ondeSegunda);
      const lado = ondeSegunda.startsWith('take') || ondeSegunda === 'meio' || rasgar ? 'antes' : 'depois';
      g[lado].push(passo);
      if (pg.bordaQueimada) g[lado].push({ tipo: 'efeito', efeito: 'fogo', intensidade: 0.45 });
    }

    if (/fogo queima a pagina|queima(m)? a pagina|pegando fogo|incendi/.test(a) && !cinzas) {
      ag.get('fim').antes.push({ tipo: 'efeito', efeito: 'fogo', intensidade: 1.2 });
      ag.get('fim').antes.push({ tipo: 'queimarPaginas' });
      estado.queimado = true;
    }
    if (/livro fech|fecha o livro|fechando/.test(a)) ag.get('fim').depois.push({ tipo: 'fecharLivro' });
  }

  if (/explos|disparo|onda de choque|luz incandescente|clarao|detona/.test(a + ' ' + som)) ag.get('fim').antes.push({ tipo: 'efeito', efeito: 'clarao' });

  // ---------- Montagem na ordem da narração ----------
  const passos: Passo[] = [];
  const despeja = (chave: string, lado: 'antes' | 'depois') => passos.push(...ag.get(chave)[lado]);
  despeja('inicio', 'antes');
  despeja('inicio', 'depois');
  const totalTexto = takes.flatMap(t => t.segmentos).filter(s => s.tipo === 'texto').length;
  let textosDitos = 0;
  const veloc = (t: Take) => (/narracao acelerada|acelerad/.test(semAcento(porTake[t.numero] ?? '')) ? 1.2 : undefined);
  const legendaInicial = /cinzas/.test(a) && !usaPorTake;

  takes.forEach((t, ti) => {
    if (ti > 0 && donos[ti] !== donos[ti - 1]) passos.push({ tipo: 'pausa', ms: 500 });
    despeja(`take:${t.numero}`, 'antes');
    t.segmentos.forEach((s: Segmento, si) => {
      const chave = chaves[ti][si];
      if (s.tipo === 'texto') {
        const p: Passo = { tipo: 'narrar', texto: s.texto };
        const dono = donos[ti];
        if (dono && dono.estilo !== 'narracao') {
          p.personagem = dono.personagem;
          p.estilo = dono.estilo;
        }
        const v = veloc(t);
        if (v) p.velocidade = v;
        if (legendaInicial && passos.every(x => x.tipo !== 'surgirDasCinzas' && x.tipo !== 'narrar')) p.legenda = true;
        passos.push(p);
        textosDitos++;
        if (textosDitos === Math.ceil(totalTexto / 2)) despeja('meio', 'antes');
        return;
      }
      despeja(chave, 'antes');
      passos.push({ tipo: 'pausa', ms: s.tipo === 'pausa' ? (/respiro/i.test(s.rotulo) ? 600 : 1700) : 500 });
      despeja(chave, 'depois');
    });
    despeja(`fim-take:${t.numero}`, 'antes');
    despeja(`fim-take:${t.numero}`, 'depois');
    despeja(`take:${t.numero}`, 'depois');
  });
  if (totalTexto === 0) despeja('meio', 'antes');
  despeja('fim', 'antes');
  passos.push({ tipo: 'pausa', ms: 1200 });
  despeja('fim', 'depois');
  return passos;
}
