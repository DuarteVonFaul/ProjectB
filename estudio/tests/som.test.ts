import { describe, expect, it } from 'vitest';
import { mesclarSom, musicasAntesDa, pedidoSonoplastia } from '../web/src/core/som';
import type { CenaPlano, Plano } from '../web/src/core/tipos';
import { validarPasso } from '../web/src/core/validar';

const cena: CenaPlano = {
  numero: 2,
  passos: [
    { tipo: 'musica', faixa: 'calma', acao: 'tocar' },
    { tipo: 'narrar', texto: 'A porta se abriu.' },
    { tipo: 'pausa', ms: 800 },
    { tipo: 'efeito', efeito: 'clarao' },
  ],
};
const plano: Plano = { versao: 1, titulo: 'T', geradoEm: '', origem: 'manual', cenas: [{ numero: 1, passos: [{ tipo: 'musica', faixa: 'agonia', acao: 'tocar' }] }, cena] };

describe('trilha sonora com o Claude', () => {
  it('troca os sons antigos pelos novos e mantém falas e efeitos na ordem', () => {
    const avisos: string[] = [];
    const r = mesclarSom(cena, [
      { tipo: 'ref', i: 0 },
      { tipo: 'som', som: 'porta' },
      { tipo: 'ref', i: 1 },
      { tipo: 'musica', faixa: 'guerra', acao: 'tocar', fade: 0.05 },
      { tipo: 'ref', i: 2 },
    ], avisos);
    expect(r.passos.map(p => p.tipo)).toEqual(['narrar', 'som', 'pausa', 'musica', 'efeito']);
    expect(r.passos.some(p => p.tipo === 'musica' && p.faixa === 'calma')).toBe(false);
    expect(avisos).toEqual([]);
  });

  it('não perde passos que a resposta esqueceu nem aceita duplicados ou fora de ordem', () => {
    const avisos: string[] = [];
    const r = mesclarSom(cena, [{ tipo: 'ref', i: 2 }, { tipo: 'ref', i: 0 }, { tipo: 'som', som: 'xpto' }], avisos);
    expect(r.passos.map(p => p.tipo)).toEqual(['narrar', 'pausa', 'efeito']);
    expect(avisos.join(' ')).toMatch(/som desconhecido/);
    expect(avisos.join(' ')).toMatch(/2 passo\(s\) não vieram/);
  });

  it('numera só os passos que não são som e conta a música que já toca', () => {
    expect(musicasAntesDa(plano, 2)).toEqual(['agonia']);
    const pedido = pedidoSonoplastia(plano, [2]);
    expect(pedido).toContain('[0] Narrador: "A porta se abriu."');
    expect(pedido).toContain('[2] efeito visual clarao');
    expect(pedido).toContain('som atual');
    expect(pedido).toContain('cena 2 começa: agonia');
  });
});

describe('aplicar a trilha à cena atual', () => {
  it('mantém as edições feitas nas falas enquanto o Claude compunha e só troca o som', async () => {
    const { aplicarSomNaCena } = await import('../web/src/core/som');
    const nova = mesclarSom(cena, [{ tipo: 'ref', i: 0 }, { tipo: 'som', som: 'porta' }, { tipo: 'ref', i: 1 }, { tipo: 'ref', i: 2 }]);
    const editada: CenaPlano = { ...cena, passos: cena.passos.map(p => (p.tipo === 'narrar' ? { ...p, texto: 'A porta rangeu.' } : p)) };
    const r = aplicarSomNaCena(editada, nova)!;
    expect(r.passos.map(p => p.tipo)).toEqual(['narrar', 'som', 'pausa', 'efeito']);
    expect(r.passos[0]).toMatchObject({ texto: 'A porta rangeu.' });
    // Passo incluído durante a composição: não dá para encaixar com segurança.
    expect(aplicarSomNaCena({ ...cena, passos: [...cena.passos, { tipo: 'pausa', ms: 300 }] }, nova)).toBeNull();
  });
});

describe('sons gravados da biblioteca', () => {
  it('vão para o pedido e o esquema do Claude e são aceitos na validação', async () => {
    const { schemaSonoplastia } = await import('../web/src/core/som');
    const bib = [{ src: '/sons/espadas/espada-choque-1.mp3', nome: 'espada choque 1', categoria: 'espadas' }];
    expect(pedidoSonoplastia(plano, [2], '', bib)).toContain('espadas: /sons/espadas/espada-choque-1.mp3');
    expect(JSON.stringify(schemaSonoplastia(bib))).toContain('/sons/espadas/espada-choque-1.mp3');
    const r = mesclarSom(cena, [{ tipo: 'ref', i: 0 }, { tipo: 'som', src: '/sons/espadas/espada-choque-1.mp3' }]);
    expect(r.passos[1]).toEqual({ tipo: 'som', src: '/sons/espadas/espada-choque-1.mp3' });
    expect(validarPasso({ tipo: 'som', src: '/sons/../../segredo.mp3' }, 'x', [])).toBeNull();
  });
});

describe('passo som', () => {
  it('aceita som do catálogo e arquivo do projeto, recusa caminhos de fora', () => {
    const e: string[] = [];
    expect(validarPasso({ tipo: 'som', som: 'chuva', volume: 5, loop: true }, 'x', e)).toEqual({ tipo: 'som', som: 'chuva', volume: 2, loop: true });
    expect(validarPasso({ tipo: 'som', src: '/arquivos/p/1-trovao.mp3', nome: 'Trovão', canal: 'musica' }, 'x', e)).toMatchObject({ src: '/arquivos/p/1-trovao.mp3', canal: 'musica' });
    expect(validarPasso({ tipo: 'som', src: 'https://exemplo.com/a.mp3' }, 'x', e)).toBeNull();
  });
});
