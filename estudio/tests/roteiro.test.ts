import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lerRoteiro, lerSegmentos, textoDoTake } from '../web/src/core/roteiro';

const prologo = readFileSync(new URL('../exemplos/prologo-virtus.txt', import.meta.url), 'utf8');

describe('lerRoteiro com o Prólogo', () => {
  const r = lerRoteiro(prologo);

  it('lê título, ambiente e as 9 cenas', () => {
    expect(r.titulo).toBe('Prólogo - Capítulo 0');
    expect(r.ambiente).toBe('Ext. Uma Folha de Livro antiga');
    expect(r.cenas.map(c => c.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.avisos).toEqual([]);
  });

  it('identifica o narrador e o texto sem aspas', () => {
    const c1 = r.cenas[0];
    expect(c1.falas).toHaveLength(1);
    expect(c1.falas[0].personagem).toBe('Narrador');
    expect(textoDoTake(c1.falas[0].takes[0])).toBe(
      'Em uma era distante, ao longo do tecido do Éter surgiu uma raça chamada Virtus.',
    );
  });

  it('separa os takes da cena 4 com a pausa no take 1', () => {
    const takes = r.cenas[3].falas[0].takes;
    expect(takes.map(t => t.numero)).toEqual([1, 2]);
    expect(takes[0].segmentos).toEqual([
      { tipo: 'texto', texto: 'Porém esse foi o maior erro que fizeram,' },
      { tipo: 'pausa', rotulo: 'Pausa' },
    ]);
    expect(textoDoTake(takes[1])).toMatch(/^alguns Virtus se corromperam,.*próprios criadores\.$/);
  });

  it('reconhece pausa numerada e transição na cena 8', () => {
    const segs = r.cenas[7].falas[0].takes[0].segmentos.map(s => s.tipo);
    expect(segs).toEqual(['texto', 'pausa', 'texto', 'transicao', 'texto']);
  });

  it('lê os 3 takes da cena 9 e o esquema por take', () => {
    const c9 = r.cenas[8];
    expect(c9.falas[0].takes.map(t => t.numero)).toEqual([1, 2, 3]);
    expect(c9.falas[0].takes[2].segmentos.map(s => s.tipo)).toEqual(['texto', 'transicao', 'pausa', 'texto']);
    expect(Object.keys(c9.animacao.porTake)).toEqual(['1', '2', '3']);
    expect(c9.animacao.porTake[2]).toMatch(/^Passando Rapidamente a página/);
    expect(c9.animacao.porTake[3]).toMatch(/Livro fechando$/);
  });

  it('separa esquema de animação e de som', () => {
    expect(r.cenas[0].animacao.texto).toMatch(/^O livro se abre/);
    expect(r.cenas[0].som.texto).toBe('Música calma com um efeito de Fantasia A¹');
  });
});

describe('casos de borda', () => {
  it('avisa quando não há cenas', () => {
    expect(lerRoteiro('só um texto').avisos[0].mensagem).toMatch(/Nenhuma cena/);
  });

  it('aceita fala sem personagem e avisa', () => {
    const r = lerRoteiro('Cena 1:\n"Olá mundo"\nEsquema de Animação: x\nEsquema de Som: y');
    expect(r.cenas[0].falas[0].personagem).toBe('Narrador');
    expect(r.avisos.some(a => /sem personagem/.test(a.mensagem))).toBe(true);
  });

  it('classifica marcadores desconhecidos', () => {
    expect(lerSegmentos('a <Zoom> b')).toEqual([
      { tipo: 'texto', texto: 'a' },
      { tipo: 'marcador', rotulo: 'Zoom' },
      { tipo: 'texto', texto: 'b' },
    ]);
  });
});
