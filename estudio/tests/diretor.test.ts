import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { faixasNoTexto, gerarPlano } from '../web/src/core/diretor';
import { lerRoteiro } from '../web/src/core/roteiro';
import type { Passo } from '../web/src/core/tipos';

const prologo = readFileSync(new URL('../exemplos/prologo-virtus.txt', import.meta.url), 'utf8');
const plano = gerarPlano(lerRoteiro(prologo));
const tipos = (n: number) => plano.cenas[n - 1].passos.map(p => p.tipo);
const passos = (n: number, tipo: Passo['tipo']) => plano.cenas[n - 1].passos.filter(p => p.tipo === tipo) as any[];

describe('faixasNoTexto', () => {
  it('reconhece a ordem das trilhas', () => {
    expect(faixasNoTexto('Música calma com um efeito de Fantasia A¹')).toEqual(['calma']);
    expect(faixasNoTexto('trilha sonora mais calma C¹ que traz um ar novamente de esperança')).toEqual(['esperanca']);
    expect(faixasNoTexto('Música de perseguição ... preenchido com uma trilha sonora calma e leve')).toEqual(['perseguicao', 'suave']);
  });
});

describe('gerarPlano com o Prólogo', () => {
  it('gera as 9 cenas e abre o livro na primeira', () => {
    expect(plano.cenas).toHaveLength(9);
    expect(tipos(1)[0]).toBe('musica');
    expect(tipos(1)).toContain('abrirLivro');
  });

  it('cena 4: sangue antes da pausa, guerra depois, nova página no take 2', () => {
    const t = tipos(4);
    expect(t.indexOf('efeito')).toBeLessThan(t.indexOf('pausa'));
    const guerra = passos(4, 'musica').find(p => p.faixa === 'guerra');
    expect(guerra.acao).toBe('tocar');
    const virar = passos(4, 'virarPagina')[0];
    expect(virar.pagina.layout).toBe('dividida');
    expect(virar.pagina.sangue).toBe(1);
  });

  it('cena 5 queima, cena 6 surge das cinzas com esperança', () => {
    expect(tipos(5)).toContain('queimarPaginas');
    expect(passos(5, 'musica').some(p => p.faixa === 'fogo' && p.acao === 'tocar')).toBe(true);
    expect(tipos(6)).toContain('surgirDasCinzas');
    expect(passos(6, 'musica').some(p => p.faixa === 'esperanca' && p.acao === 'tocar')).toBe(true);
    expect(passos(6, 'narrar')[0].legenda).toBe(true);
  });

  it('cena 8: página desfocada, foco na pausa, rasgo na transição e silêncio', () => {
    expect(passos(8, 'virarPagina')[0].pagina.desfocada).toBe(true);
    const t = tipos(8);
    expect(t).toContain('rasgarPagina');
    expect(passos(8, 'rasgarPagina')[0].pagina.escura).toBe(true);
    expect(passos(8, 'musica').some(p => p.faixa === 'agonia' && p.acao === 'parar')).toBe(true);
  });

  it('cena 9: perseguição, folheio rápido, perfuração, página de sangue e livro fechando', () => {
    expect(passos(9, 'musica')[0]).toMatchObject({ faixa: 'perseguicao', acao: 'tocar' });
    expect(passos(9, 'virarPagina').filter(p => p.velocidade === 'relampago').length).toBeGreaterThanOrEqual(4);
    expect(passos(9, 'efeito').some(p => p.efeito === 'perfurar')).toBe(true);
    expect(passos(9, 'virarPagina').some(p => p.velocidade === 'lenta')).toBe(true);
    expect(passos(9, 'narrar').some(p => p.velocidade === 1.2)).toBe(true);
    expect(tipos(9)).toContain('fecharLivro');
    expect(passos(9, 'musica').some(p => p.faixa === 'suave' && p.acao === 'tocar')).toBe(true);
  });

  it('toda narração do roteiro aparece no plano', () => {
    const narr = plano.cenas.flatMap(c => c.passos).filter(p => p.tipo === 'narrar');
    expect(narr.length).toBeGreaterThan(15);
    expect(narr.every((p: any) => p.texto.length > 0)).toBe(true);
  });
});
