/**
 * Limpeza de SVG gerado por IA antes de entrar na página:
 * - aceita só um elemento <svg> com viewBox;
 * - remove scripts, foreignObject, eventos (on*), links externos e javascript:;
 * - dá prefixo único aos ids (várias ilustrações convivem na mesma página e nas cópias da folha virando).
 */
export class SvgInvalido extends Error {}

const LIMITE = 250_000;

export function limparSvg(bruto: string, prefixo: string, viewBoxPadrao?: string): string {
  let s = String(bruto ?? '').trim();
  s = s.replace(/^```(?:svg|xml)?\s*|\s*```$/g, '');
  s = s.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  const ini = s.search(/<svg[\s>]/i);
  const fim = s.lastIndexOf('</svg>');
  if (ini < 0 || fim < ini) throw new SvgInvalido('A resposta não contém um <svg> completo.');
  s = s.slice(ini, fim + 6);
  if (s.length > LIMITE) throw new SvgInvalido('SVG grande demais.');

  // Elementos proibidos (com conteúdo) e auto-fechados.
  for (const tag of ['script', 'foreignObject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas', 'a', 'image', 'text'])
    s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '').replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  // Atributos de evento e URLs perigosas.
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/\s(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, _q, a, b) => ((a ?? b ?? '').startsWith('#') ? m : ''));
  s = s.replace(/javascript:/gi, '');
  s = s.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none');

  // Raiz: sem width/height (o slot define), com viewBox.
  s = s.replace(/^<svg\b([^>]*)>/i, (_m, attrs: string) => {
    let a = attrs.replace(/\s(width|height|x|y)\s*=\s*("[^"]*"|'[^']*')/gi, '');
    if (!/viewBox\s*=/i.test(a)) {
      if (!viewBoxPadrao) throw new SvgInvalido('SVG sem viewBox.');
      a += ` viewBox="${viewBoxPadrao}"`;
    }
    if (!/xmlns\s*=/.test(a)) a += ' xmlns="http://www.w3.org/2000/svg"';
    if (!/preserveAspectRatio/.test(a)) a += ' preserveAspectRatio="xMidYMid meet"';
    return `<svg${a}>`;
  });

  // Ids com prefixo.
  const ids = new Set([...s.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));
  for (const id of ids) {
    const novo = `${prefixo}-${id}`;
    const e = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s
      .replace(new RegExp(`(\\sid\\s*=\\s*["'])${e}(["'])`, 'g'), `$1${novo}$2`)
      .replace(new RegExp(`url\\(\\s*#${e}\\s*\\)`, 'g'), `url(#${novo})`)
      .replace(new RegExp(`(href\\s*=\\s*["'])#${e}(["'])`, 'g'), `$1#${novo}$2`);
  }
  if (!/<(path|circle|ellipse|rect|line|polyline|polygon)\b/i.test(s)) throw new SvgInvalido('SVG sem desenho.');
  return s;
}
