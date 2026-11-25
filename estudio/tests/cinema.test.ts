import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { livroParaCinema } from '../web/src/core/cinema';
import { gerarPlano } from '../web/src/core/diretor';
import { montarPedido } from '../web/src/core/promptDiretor';
import { lerRoteiro } from '../web/src/core/roteiro';
import { PASSOS_LIVRO } from '../web/src/core/tipos';
import { schemaResposta, validarCenas } from '../web/src/core/validar';

const roteiro = lerRoteiro(readFileSync(new URL('../exemplos/prologo-virtus.txt', import.meta.url), 'utf8'));
const livro = gerarPlano(roteiro);
const cinema = livroParaCinema(livro);
const passos = cinema.cenas.flatMap(c => c.passos);

describe('livroParaCinema', () => {
  it('troca o formato e não deixa passos de livro', () => {
    expect(cinema.formato).toBe('cinema');
    expect(passos.some(p => (PASSOS_LIVRO as readonly string[]).includes(p.tipo))).toBe(false);
  });

  it('abre com título e um plano vindo do preto', () => {
    // A música pode começar antes; o primeiro passo visual é o título.
    expect(cinema.cenas[0].passos.find(p => p.tipo !== 'musica')).toMatchObject({ tipo: 'titulo', texto: livro.titulo });
    expect(cinema.cenas[0].passos.find(p => p.tipo === 'mostrar')).toMatchObject({ transicao: 'preto' });
  });

  it('página dividida vira dois planos, o segundo depois da fala', () => {
    const c4 = cinema.cenas[3].passos.map(p => p.tipo);
    const i = c4.indexOf('mostrar');
    expect(c4.filter(t => t === 'mostrar')).toHaveLength(2);
    expect(c4.slice(i + 1).indexOf('narrar')).toBeLessThan(c4.slice(i + 1).indexOf('mostrar'));
  });

  it('queimar vira fogo e escurecer; rasgar vira tremor e plano pelo branco', () => {
    expect(cinema.cenas[4].passos.some(p => p.tipo === 'escurecer')).toBe(true);
    const c8 = cinema.cenas[7].passos;
    expect(c8.some(p => p.tipo === 'tremor')).toBe(true);
    expect(c8.some(p => p.tipo === 'mostrar' && p.transicao === 'branco')).toBe(true);
  });

  it('mantém toda a narração e passa na validação do formato cinema', () => {
    expect(passos.filter(p => p.tipo === 'narrar')).toHaveLength(livro.cenas.flatMap(c => c.passos).filter(p => p.tipo === 'narrar').length);
    expect(validarCenas({ cenas: cinema.cenas }, roteiro.cenas, undefined, 'cinema').erros).toEqual([]);
  });
});

describe('validação e pedido por formato', () => {
  it('recusa passo de livro num plano de cinema', () => {
    const { erros } = validarCenas({ cenas: [{ numero: 1, passos: [{ tipo: 'fecharLivro' }] }] }, roteiro.cenas.slice(0, 1), undefined, 'cinema');
    expect(erros.join('\n')).toMatch(/não existe no formato cinematográfico/);
  });

  it('o schema de cinema só oferece passos de cinema', () => {
    const s = JSON.stringify(schemaResposta('cinema'));
    expect(s).toMatch(/"mostrar"/);
    expect(s).not.toMatch(/"abrirLivro"/);
    expect(JSON.stringify(schemaResposta())).toMatch(/"abrirLivro"/);
  });

  it('o pedido fala de tela, não de livro', () => {
    expect(montarPedido(roteiro, { formato: 'cinema' })).toMatch(/tela começa preta/);
  });
});

describe('bíblia visual no pedido ao diretor', () => {
  it('leva o elenco quando existe', () => {
    const p = montarPedido(roteiro, { formato: 'cinema', elenco: { estilo: 'Nanquim sombrio.', personagens: [{ nome: 'ORB', descricao: 'olho vermelho' }] } });
    expect(p).toMatch(/Bíblia visual/);
    expect(p).toMatch(/ORB: olho vermelho/);
    expect(montarPedido(roteiro, { formato: 'cinema' })).not.toMatch(/Bíblia visual/);
  });
});
