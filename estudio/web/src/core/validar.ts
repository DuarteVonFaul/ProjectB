import { textoDoTake } from './roteiro';
import { PASSOS_CINEMA, PASSOS_LIVRO, type CenaPlano, type CenaRoteiro, type Efeito, type Faixa, type Formato, type Ilustracao, type Movimento, type Pagina, type Passo, type Som, type Transicao, type Velocidade } from './tipos';

/** Catálogo fechado que o diretor (automático ou IA) pode usar. */
export const FAIXAS: Faixa[] = ['calma', 'guerra', 'esperanca', 'agonia', 'perseguicao', 'fogo', 'suave'];
export const EFEITOS: Efeito[] = ['sangue', 'fogo', 'apagarFogo', 'brilho', 'focar', 'perfurar', 'clarao', 'fim'];
export const SONS: Som[] = ['trovao', 'vento', 'chuva', 'fogueira', 'coracao', 'passos', 'porta', 'sino', 'espada', 'magia', 'sussurro', 'impacto', 'explosao', 'pagina', 'rasgo', 'suspense', 'tique'];
/** Sons que ficam tocando (ambiente) até um "parar". */
export const SONS_LOOP: Som[] = ['vento', 'chuva', 'fogueira', 'coracao', 'suspense', 'tique'];
export const VELOCIDADES: Velocidade[] = ['lenta', 'normal', 'rapida', 'relampago'];
export const TRANSICOES: Transicao[] = ['corte', 'fusao', 'preto', 'branco', 'deslize'];
export const MOVIMENTOS: Movimento[] = ['parado', 'aproximar', 'afastar', 'esquerda', 'direita', 'subir', 'descer', 'aproximarRapido'];

const num = (v: unknown, min: number, max: number, padrao?: number) => {
  const n = typeof v === 'number' && isFinite(v) ? v : padrao;
  return n === undefined ? undefined : Math.min(max, Math.max(min, n));
};
const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function validarPagina(p: any, onde: string, erros: string[]): Pagina | null {
  if (!p || typeof p !== 'object') {
    erros.push(`${onde}: falta "pagina".`);
    return null;
  }
  const layout = p.layout === 'dividida' ? 'dividida' : 'inteira';
  const lista: any[] = Array.isArray(p.ilustracoes) ? p.ilustracoes : [];
  const qtd = layout === 'dividida' ? 2 : 1;
  const ilustracoes: Ilustracao[] = lista.slice(0, qtd).map(i => {
    const fonte = i?.fonte === 'imagem' || i?.fonte === 'svg' ? i.fonte : 'esboco';
    const il: Ilustracao = { descricao: texto(i?.descricao), fonte };
    if (fonte === 'imagem' && typeof i.src === 'string') il.src = i.src;
    if (fonte === 'svg' && typeof i.svg === 'string') il.svg = i.svg;
    return il;
  });
  const semIlustracao = (p.sangue ?? 0) >= 3 && ilustracoes.length === 0; // página só de sangue é permitida
  if (!semIlustracao && ilustracoes.length < qtd) erros.push(`${onde}: layout "${layout}" precisa de ${qtd} ilustração(ões).`);
  if (ilustracoes.some(i => !i.descricao && i.fonte === 'esboco')) erros.push(`${onde}: ilustração sem descrição.`);
  const out: Pagina = { layout, ilustracoes };
  const sangue = num(p.sangue, 0, 3);
  if (sangue) out.sangue = Math.round(sangue);
  if (p.bordaQueimada === true) out.bordaQueimada = true;
  if (p.escura === true) out.escura = true;
  if (p.desfocada === true) out.desfocada = true;
  return out;
}

export function validarPasso(p: any, onde: string, erros: string[]): Passo | null {
  const tipo = p?.tipo;
  switch (tipo) {
    case 'abrirLivro':
    case 'rasgarPagina':
    case 'surgirDasCinzas': {
      const pagina = validarPagina(p.pagina, onde, erros);
      return pagina ? { tipo, pagina } : null;
    }
    case 'virarPagina': {
      const pagina = validarPagina(p.pagina, onde, erros);
      if (!pagina) return null;
      const v: Passo = { tipo, pagina, velocidade: VELOCIDADES.includes(p.velocidade) ? p.velocidade : 'normal' };
      if (p.manterTexto === true) v.manterTexto = true;
      return v;
    }
    case 'fecharLivro':
    case 'queimarPaginas':
      return { tipo };
    case 'narrar': {
      const t = texto(p.texto);
      if (!t) {
        erros.push(`${onde}: narração vazia.`);
        return null;
      }
      const n: Extract<Passo, { tipo: 'narrar' }> = { tipo, texto: t };
      const v = num(p.velocidade, 0.7, 1.4);
      if (v && v !== 1) n.velocidade = v;
      if (p.legenda === true) n.legenda = true;
      const quem = texto(p.personagem);
      if (quem && !/^narrador/i.test(quem)) n.personagem = quem.slice(0, 60);
      if (p.estilo === 'pensamento' || p.estilo === 'fala') n.estilo = p.estilo;
      return n;
    }
    case 'pausa':
      return { tipo, ms: Math.round(num(p.ms, 100, 8000, 1200)!) };
    case 'musica': {
      if (!FAIXAS.includes(p.faixa)) {
        erros.push(`${onde}: faixa desconhecida "${p.faixa}".`);
        return null;
      }
      const m: Passo = { tipo, faixa: p.faixa, acao: p.acao === 'parar' ? 'parar' : 'tocar' };
      const fade = num(p.fade, 0, 12);
      if (fade !== undefined) m.fade = fade;
      const vol = num(p.volume, 0, 2);
      if (vol !== undefined) m.volume = vol;
      return m;
    }
    case 'musicaAjuste': {
      if (!FAIXAS.includes(p.faixa)) {
        erros.push(`${onde}: faixa desconhecida "${p.faixa}".`);
        return null;
      }
      const a: Passo = { tipo, faixa: p.faixa };
      const vol = num(p.volume, 0, 2), int = num(p.intensidade, 0.3, 2.5), and = num(p.andamento, 40, 220), dur = num(p.duracao, 0, 12);
      if (vol !== undefined) a.volume = vol;
      if (int !== undefined) a.intensidade = int;
      if (and !== undefined) a.andamento = Math.round(and);
      if (dur !== undefined) a.duracao = dur;
      return a;
    }
    case 'efeito': {
      if (!EFEITOS.includes(p.efeito)) {
        erros.push(`${onde}: efeito desconhecido "${p.efeito}".`);
        return null;
      }
      const e: Passo = { tipo, efeito: p.efeito };
      const int = num(p.intensidade, 0, 3);
      if (int !== undefined) e.intensidade = int;
      return e;
    }
    case 'som': {
      const src = typeof p.src === 'string' && /^\/(arquivos|sons)\//.test(p.src) && !p.src.includes('..') ? p.src : undefined;
      if (!src && !SONS.includes(p.som)) {
        erros.push(`${onde}: som desconhecido "${p.som}".`);
        return null;
      }
      const o: Extract<Passo, { tipo: 'som' }> = { tipo };
      if (src) {
        o.src = src;
        if (typeof p.nome === 'string' && p.nome.trim()) o.nome = p.nome.trim().slice(0, 80);
      } else o.som = p.som;
      if (p.acao === 'parar') o.acao = 'parar';
      const vol = num(p.volume, 0, 2), fade = num(p.fade, 0, 12);
      if (vol !== undefined) o.volume = vol;
      if (fade !== undefined) o.fade = fade;
      if (p.loop === true) o.loop = true;
      if (p.canal === 'musica') o.canal = 'musica';
      return o;
    }
    case 'mostrar': {
      const il = p.ilustracao;
      const fonte = il?.fonte === 'imagem' || il?.fonte === 'svg' ? il.fonte : 'esboco';
      const ilustracao: Ilustracao = { descricao: texto(il?.descricao), fonte };
      if (fonte === 'imagem' && typeof il.src === 'string') ilustracao.src = il.src;
      if (fonte === 'svg' && typeof il.svg === 'string') ilustracao.svg = il.svg;
      if (!ilustracao.descricao && fonte === 'esboco') erros.push(`${onde}: plano sem descrição da imagem.`);
      const m: Extract<Passo, { tipo: 'mostrar' }> = {
        tipo,
        ilustracao,
        transicao: TRANSICOES.includes(p.transicao) ? p.transicao : 'fusao',
        movimento: MOVIMENTOS.includes(p.movimento) ? p.movimento : 'aproximar',
      };
      if (p.escura === true) m.escura = true;
      if (p.desfocada === true) m.desfocada = true;
      return m;
    }
    case 'camera': {
      if (!MOVIMENTOS.includes(p.movimento)) {
        erros.push(`${onde}: movimento de câmera desconhecido "${p.movimento}".`);
        return null;
      }
      const c: Extract<Passo, { tipo: 'camera' }> = { tipo, movimento: p.movimento };
      const d = num(p.duracao, 0.5, 60);
      if (d !== undefined) c.duracao = d;
      return c;
    }
    case 'tremor':
      return { tipo, intensidade: num(p.intensidade, 0.2, 3, 1) };
    case 'titulo': {
      const t = texto(p.texto);
      if (!t) return null;
      const ti: Extract<Passo, { tipo: 'titulo' }> = { tipo, texto: t.slice(0, 120) };
      if (texto(p.subtitulo)) ti.subtitulo = texto(p.subtitulo).slice(0, 160);
      return ti;
    }
    case 'escurecer':
      return { tipo, cor: p.cor === 'branco' ? 'branco' : 'preto', duracao: num(p.duracao, 0.2, 8, 1.5) };
    default:
      erros.push(`${onde}: tipo de passo desconhecido "${tipo}".`);
      return null;
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Valida e normaliza as cenas devolvidas pelo diretor.
 * Também confere se toda a narração do roteiro aparece, na ordem, e se o livro é usado de forma coerente.
 */
export function validarCenas(
  bruto: unknown,
  roteiroCenas: CenaRoteiro[],
  inicio: { livroAberto: boolean; queimado: boolean } = { livroAberto: false, queimado: false },
  formato: Formato = 'livro',
): { cenas: CenaPlano[]; erros: string[] } {
  const erros: string[] = [];
  const lista: any[] = Array.isArray((bruto as any)?.cenas) ? (bruto as any).cenas : Array.isArray(bruto) ? (bruto as any[]) : [];
  if (!lista.length) return { cenas: [], erros: ['A resposta não tem a lista "cenas".'] };

  const esperadas = roteiroCenas.map(c => c.numero);
  const cenas: CenaPlano[] = [];
  let aberto = inicio.livroAberto, queimado = inicio.queimado;

  for (const numero of esperadas) {
    const c = lista.find(x => Number(x?.numero) === numero);
    if (!c) {
      erros.push(`Faltou a cena ${numero}.`);
      continue;
    }
    const passos: Passo[] = [];
    (Array.isArray(c.passos) ? c.passos : []).forEach((p: any, i: number) => {
      const v = validarPasso(p, `Cena ${numero}, passo ${i + 1}`, erros);
      if (!v) return;
      const doOutro = (formato === 'cinema' ? PASSOS_LIVRO : PASSOS_CINEMA) as readonly string[];
      if (doOutro.includes(v.tipo)) erros.push(`Cena ${numero}: "${v.tipo}" não existe no formato ${formato === 'cinema' ? 'cinematográfico' : 'livro'}.`);
      else passos.push(v);
    });
    // Coerência do livro
    for (const p of formato === 'livro' ? passos : []) {
      if (p.tipo === 'abrirLivro') {
        if (aberto) erros.push(`Cena ${numero}: "abrirLivro" com o livro já aberto (use "virarPagina").`);
        aberto = true;
        queimado = false;
      } else if (p.tipo === 'virarPagina' || p.tipo === 'rasgarPagina') {
        if (!aberto) erros.push(`Cena ${numero}: "${p.tipo}" com o livro fechado (comece com "abrirLivro").`);
        if (queimado) erros.push(`Cena ${numero}: "${p.tipo}" depois de queimar as páginas (use "surgirDasCinzas").`);
      } else if (p.tipo === 'surgirDasCinzas') {
        if (!queimado) erros.push(`Cena ${numero}: "surgirDasCinzas" sem páginas queimadas antes.`);
        queimado = false;
      } else if (p.tipo === 'queimarPaginas') queimado = true;
      else if (p.tipo === 'fecharLivro') aberto = false;
    }
    // Cobertura da narração
    const roteiroCena = roteiroCenas.find(r => r.numero === numero)!;
    const falado = norm(passos.filter(p => p.tipo === 'narrar').map(p => (p as { texto: string }).texto).join(' '));
    const esperado = norm(roteiroCena.falas.flatMap(f => f.takes).map(textoDoTake).join(' '));
    const palavrasEsperadas = esperado.split(' ').filter(Boolean);
    const faltando = palavrasEsperadas.filter(w => !falado.includes(w));
    if (palavrasEsperadas.length && faltando.length / palavrasEsperadas.length > 0.15)
      erros.push(`Cena ${numero}: a narração do roteiro não foi incluída por completo (faltam, por exemplo: "${faltando.slice(0, 5).join(' ')}").`);
    cenas.push({ numero, passos });
  }
  return { cenas, erros };
}

export const esquemaPasso = (tipo: string, props: Record<string, unknown> = {}, req: string[] = []) => ({
  type: 'object',
  properties: { tipo: { const: tipo }, ...props },
  required: ['tipo', ...req],
  additionalProperties: false,
});
/** Passo "som" como a IA pode usar (só sons do estúdio; arquivos enviados ficam com o usuário). */
export const passoSom = esquemaPasso('som', { som: { enum: SONS }, acao: { enum: ['tocar', 'parar'] }, volume: { type: 'number' }, loop: { type: 'boolean' }, fade: { type: 'number' } }, ['som']);

/** Schema JSON da resposta do diretor (usado pela CLI do Claude para validar a saída). */
export function schemaResposta(formato: Formato = 'livro') {
  const pagina = {
    type: 'object',
    properties: {
      layout: { enum: ['inteira', 'dividida'] },
      ilustracoes: {
        type: 'array',
        maxItems: 2,
        items: { type: 'object', properties: { descricao: { type: 'string' }, fonte: { enum: ['esboco'] } }, required: ['descricao', 'fonte'], additionalProperties: false },
      },
      sangue: { type: 'integer', minimum: 0, maximum: 3 },
      bordaQueimada: { type: 'boolean' },
      escura: { type: 'boolean' },
      desfocada: { type: 'boolean' },
    },
    required: ['layout', 'ilustracoes'],
    additionalProperties: false,
  };
  const passo = esquemaPasso;
  return {
    type: 'object',
    properties: {
      cenas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            numero: { type: 'integer' },
            passos: {
              type: 'array',
              items: {
                anyOf: [
                  ...(formato === 'cinema'
                    ? [
                        passo('mostrar', {
                          ilustracao: { type: 'object', properties: { descricao: { type: 'string' }, fonte: { enum: ['esboco'] } }, required: ['descricao', 'fonte'], additionalProperties: false },
                          transicao: { enum: TRANSICOES },
                          movimento: { enum: MOVIMENTOS },
                          escura: { type: 'boolean' },
                          desfocada: { type: 'boolean' },
                        }, ['ilustracao']),
                        passo('camera', { movimento: { enum: MOVIMENTOS }, duracao: { type: 'number' } }, ['movimento']),
                        passo('tremor', { intensidade: { type: 'number' } }),
                        passo('titulo', { texto: { type: 'string' }, subtitulo: { type: 'string' } }, ['texto']),
                        passo('escurecer', { cor: { enum: ['preto', 'branco'] }, duracao: { type: 'number' } }),
                      ]
                    : [
                        passo('abrirLivro', { pagina }, ['pagina']),
                        passo('fecharLivro'),
                        passo('virarPagina', { pagina, velocidade: { enum: VELOCIDADES }, manterTexto: { type: 'boolean' } }, ['pagina']),
                        passo('rasgarPagina', { pagina }, ['pagina']),
                        passo('queimarPaginas'),
                        passo('surgirDasCinzas', { pagina }, ['pagina']),
                      ]),
                  passo('narrar', { texto: { type: 'string' }, velocidade: { type: 'number' }, legenda: { type: 'boolean' }, personagem: { type: 'string' }, estilo: { enum: ['narracao', 'pensamento', 'fala'] } }, ['texto']),
                  passo('pausa', { ms: { type: 'integer' } }, ['ms']),
                  passo('musica', { faixa: { enum: FAIXAS }, acao: { enum: ['tocar', 'parar'] }, fade: { type: 'number' }, volume: { type: 'number' } }, ['faixa', 'acao']),
                  passo('musicaAjuste', { faixa: { enum: FAIXAS }, volume: { type: 'number' }, intensidade: { type: 'number' }, andamento: { type: 'integer' }, duracao: { type: 'number' } }, ['faixa']),
                  passo('efeito', { efeito: { enum: EFEITOS }, intensidade: { type: 'number' } }, ['efeito']),
                  passoSom,
                ],
              },
            },
          },
          required: ['numero', 'passos'],
          additionalProperties: false,
        },
      },
    },
    required: ['cenas'],
    additionalProperties: false,
  };
}
