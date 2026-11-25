import { describe, expect, it } from 'vitest';
import { montarLegendas } from '../server/exportacao';
import type { Plano } from '../web/src/core/tipos';
import { CATALOGO_VOZES, chaveFala, falasDoPlano, VOZES_PADRAO } from '../web/src/core/vozes';

const plano: Plano = {
  versao: 1,
  titulo: 't',
  geradoEm: '',
  origem: 'manual',
  cenas: [
    {
      numero: 1,
      passos: [
        { tipo: 'narrar', texto: 'Olá mundo.' },
        { tipo: 'narrar', texto: 'Olá mundo.' },
        { tipo: 'narrar', texto: 'Dez por cento.', personagem: 'ORB (Drone)', estilo: 'fala', velocidade: 1.2 },
      ],
    },
  ],
};

describe('vozes', () => {
  it('a chave muda com voz e velocidade e não repete falas iguais', () => {
    expect(chaveFala('a', 'faber', 1)).not.toBe(chaveFala('a', 'cadu', 1));
    expect(chaveFala('a', 'faber', 1)).not.toBe(chaveFala('a', 'faber', 1.2));
    const cfg = { ...VOZES_PADRAO, personagens: { 'ORB (Drone)': { voz: 'jeff' as const, velocidade: 1 } } };
    const f = falasDoPlano(plano, cfg);
    expect(f).toHaveLength(2);
    expect(f[1]).toMatchObject({ voz: 'jeff', velocidade: 1.2 });
  });
});

describe('catálogo de vozes', () => {
  it('tem as vozes pt-BR do Kokoro, femininas e masculinas, e marca as de outros idiomas como experimentais', () => {
    const dora = CATALOGO_VOZES.find(v => v.id === 'kokoro:pf_dora');
    expect(dora).toMatchObject({ genero: 'feminina', experimental: false, motor: 'kokoro', nome: 'Dora' });
    expect(CATALOGO_VOZES.find(v => v.id === 'kokoro:pm_alex')).toMatchObject({ genero: 'masculina', experimental: false });
    expect(CATALOGO_VOZES.find(v => v.id === 'kokoro:if_sara')).toMatchObject({ genero: 'feminina', experimental: true, origem: 'italiano' });
    expect(CATALOGO_VOZES.filter(v => v.genero === 'feminina').length).toBeGreaterThan(20);
  });

  it('o tom muda a chave da fala (e tom zero mantém a chave antiga)', () => {
    expect(chaveFala('a', 'faber', 1, 0)).toBe(chaveFala('a', 'faber', 1));
    expect(chaveFala('a', 'faber', 1, -3)).not.toBe(chaveFala('a', 'faber', 1));
  });
});

describe('legendas do vídeo', () => {
  it('gera ASS com nome curto, itálico no pensamento e tempos', () => {
    const ass = montarLegendas([
      { texto: 'Dez {por} cento.', personagem: 'ORB (Drone)', estilo: 'fala', ini: 1230, fim: 3000 },
      { texto: 'Pensando.', personagem: 'Lia', estilo: 'pensamento', ini: 4000, fim: 5000 },
      { texto: 'sem fim', ini: 6000, fim: 0 },
    ]);
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain('Dialogue: 0,0:00:01.23,0:00:03.25,Fala,,0,0,0,,{\\fs40\\b1\\c&H6AC4F0&}ORB\\N{\\r}Dez por cento.');
    expect(ass).toContain('{\\i1}Pensando.');
    expect(ass).not.toContain('sem fim');
  });

  it('uma legenda termina antes da próxima começar', () => {
    const ass = montarLegendas([
      { texto: 'A', ini: 0, fim: 1000 },
      { texto: 'B', ini: 1100, fim: 2000 },
    ]);
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.08,Fala');
    expect(ass).toContain('Dialogue: 0,0:00:01.10,0:00:02.25,Fala');
  });
});
