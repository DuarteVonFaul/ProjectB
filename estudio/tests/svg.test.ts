import { describe, expect, it } from 'vitest';
import { limparSvg, SvgInvalido } from '../web/src/core/svg';

describe('limparSvg', () => {
  it('remove scripts, eventos, links externos e foreignObject', () => {
    const sujo = `<svg width="100" height="50" viewBox="0 0 100 50" onload="alert(1)"><script>alert(2)</script><foreignObject><div>x</div></foreignObject><a href="http://mal.com"><rect width="5" height="5"/></a><path d="M0 0L10 10" onclick="x()" stroke="#000"/><image href="http://x/y.png"/><rect fill="url(http://x)" width="1" height="1"/></svg>`;
    const s = limparSvg(sujo, 'p1');
    expect(s).not.toMatch(/script|onload|onclick|foreignObject|http:\/\/(mal|x)|<image|<a\b/i);
    expect(s).toMatch(/<path d="M0 0L10 10" stroke="#000"\/>/);
    expect(s).not.toMatch(/width="100"/);
  });

  it('prefixa ids e referências', () => {
    const s = limparSvg('<svg viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="1" height="1"/><use href="#g"/></svg>', 'c1');
    expect(s).toMatch(/id="c1-g"/);
    expect(s).toMatch(/url\(#c1-g\)/);
    expect(s).toMatch(/href="#c1-g"/);
  });

  it('aceita cerca de código e completa viewBox', () => {
    const s = limparSvg('```svg\n<svg><circle r="3"/></svg>\n```', 'x', '0 0 388 262');
    expect(s).toMatch(/^<svg viewBox="0 0 388 262"/);
  });

  it('recusa resposta sem svg ou sem desenho', () => {
    expect(() => limparSvg('não sei desenhar', 'x')).toThrow(SvgInvalido);
    expect(() => limparSvg('<svg viewBox="0 0 1 1"><g/></svg>', 'x')).toThrow(SvgInvalido);
  });
});
