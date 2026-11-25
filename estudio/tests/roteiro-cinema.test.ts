import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gerarPlano } from '../web/src/core/diretor';
import { montarPedido } from '../web/src/core/promptDiretor';
import { lerRoteiro, textoDoTake } from '../web/src/core/roteiro';
import { validarCenas } from '../web/src/core/validar';

const r = lerRoteiro(readFileSync(new URL('./fixtures/roteiro-cinema.txt', import.meta.url), 'utf8'));
const cena = (n: number) => r.cenas.find(c => c.numero === n)!;
const tipos = (n: number) => cena(n).elementos.map(e => e.tipo);

describe('roteiro no estilo cinema (Lia)', () => {
  it('lê as 10 cenas sem avisos', () => {
    expect(r.cenas.map(c => c.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.avisos).toEqual([]);
    expect(r.ambiente).toMatch(/^Ext\. Ilha Corvo/);
  });

  it('cena 1: ambiente, ação e som, sem falas', () => {
    expect(tipos(1)).toEqual(['ambiente', 'acao', 'som']);
    expect(cena(1).falas).toEqual([]);
    expect(cena(1).animacao.texto).toMatch(/Lia está próxima ao Arquipélago/);
    expect(cena(1).som.texto).toMatch(/Sons de água/);
  });

  it('pensamentos de Lia com V.O e lembranças', () => {
    const f = cena(2).falas[0];
    expect(f).toMatchObject({ personagem: 'Lia Moreau', estilo: 'pensamento' });
    expect(textoDoTake(f.takes[0])).toBe('Toda noite o mesmo farol aparece, piscando no horizonte dos meus sonhos');
    expect(tipos(2)).toEqual(['fala', 'lembranca']);
  });

  it('diálogo com travessões, vários personagens e nota', () => {
    expect(tipos(5)).toEqual(['fala', 'nota']);
    expect(cena(5).falas[0]).toMatchObject({ personagem: 'ORB (Orbital Reconnaissance Bot)', estilo: 'fala' });
    expect(cena(6).falas.map(f => f.personagem)).toEqual(['Lia Moreau', 'ORB (Orbital Reconnaissance Bot)', 'Lia Moreau', 'ORB (Orbital Reconnaissance Bot)']);
    expect(textoDoTake(cena(6).falas[2].takes[0])).toBe('Sim, Vamos acender aquele farol.');
  });

  it('linhas seguidas da mesma fala viram respiros', () => {
    const segs = cena(8).falas[0].takes[0].segmentos;
    expect(segs.filter(s => s.tipo === 'texto')).toHaveLength(5);
    expect(segs.filter(s => s.tipo === 'pausa').every(s => (s as any).rotulo === 'respiro')).toBe(true);
  });

  it('cena 7 mantém a ordem ação → pensamentos → lembrança', () => {
    expect(tipos(7)).toEqual(['acao', 'fala', 'fala', 'lembranca']);
  });

  it('o diretor automático cria páginas com descrição e marca personagens', () => {
    const plano = gerarPlano(r);
    const paginas = plano.cenas.flatMap(c => c.passos).filter((p: any) => p.pagina);
    expect(paginas.length).toBeGreaterThan(3);
    expect(paginas.every((p: any) => p.pagina.ilustracoes.every((i: any) => i.descricao.length > 5))).toBe(true);
    const narr = plano.cenas.flatMap(c => c.passos).filter(p => p.tipo === 'narrar') as any[];
    expect(narr.some(n => n.personagem === 'Lia Moreau' && n.estilo === 'pensamento')).toBe(true);
    expect(narr.some(n => /^ORB/.test(n.personagem) && n.estilo === 'fala')).toBe(true);
    expect(narr.some(n => /Lia está próxima/.test(n.texto))).toBe(false);
    expect(plano.cenas[8].passos.some((p: any) => p.efeito === 'clarao')).toBe(true);
    expect(validarCenas({ cenas: plano.cenas }, r.cenas).erros).toEqual([]);
  });

  it('o pedido ao Claude leva os elementos na ordem', () => {
    const pedido = montarPedido(r, {});
    expect(pedido).toMatch(/"elementos"/);
    expect(pedido).toMatch(/"tipo": "lembranca"/);
    expect(pedido).toMatch(/"estilo": "pensamento"/);
  });
});
