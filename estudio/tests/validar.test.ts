import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gerarPlano } from '../web/src/core/diretor';
import { estadoAntesDa, montarPedido } from '../web/src/core/promptDiretor';
import { lerRoteiro } from '../web/src/core/roteiro';
import { schemaResposta, validarCenas } from '../web/src/core/validar';

const roteiro = lerRoteiro(readFileSync(new URL('../exemplos/prologo-virtus.txt', import.meta.url), 'utf8'));
const plano = gerarPlano(roteiro);

describe('validarCenas', () => {
  it('aceita o plano do diretor automático sem erros', () => {
    const { cenas, erros } = validarCenas({ cenas: plano.cenas }, roteiro.cenas);
    expect(erros).toEqual([]);
    expect(cenas).toHaveLength(9);
  });

  it('aponta cena faltando, faixa inválida e livro fechado', () => {
    const { erros } = validarCenas(
      { cenas: [{ numero: 1, passos: [{ tipo: 'virarPagina', pagina: { layout: 'inteira', ilustracoes: [{ descricao: 'x', fonte: 'esboco' }] } }, { tipo: 'musica', faixa: 'rock', acao: 'tocar' }] }] },
      roteiro.cenas.slice(0, 2),
    );
    expect(erros.join('\n')).toMatch(/livro fechado/);
    expect(erros.join('\n')).toMatch(/faixa desconhecida "rock"/);
    expect(erros.join('\n')).toMatch(/Faltou a cena 2/);
    expect(erros.join('\n')).toMatch(/narração do roteiro não foi incluída/);
  });

  it('exige surgirDasCinzas depois de queimar', () => {
    const pg = { layout: 'inteira', ilustracoes: [{ descricao: 'x', fonte: 'esboco' }] };
    const { erros } = validarCenas(
      { cenas: [{ numero: 6, passos: [{ tipo: 'virarPagina', pagina: pg }] }] },
      roteiro.cenas.filter(c => c.numero === 6),
      { livroAberto: true, queimado: true },
    );
    expect(erros.join('\n')).toMatch(/surgirDasCinzas/);
  });

  it('limita números fora da faixa', () => {
    const { cenas } = validarCenas({ cenas: [{ numero: 1, passos: [{ tipo: 'pausa', ms: 99999 }] }] }, roteiro.cenas.slice(0, 1));
    expect(cenas[0].passos[0]).toEqual({ tipo: 'pausa', ms: 8000 });
  });
});

describe('montarPedido', () => {
  it('inclui o estado de continuidade quando dirige só uma cena', () => {
    expect(estadoAntesDa(plano, 6)).toMatchObject({ livroAberto: true, queimado: true, musicas: ['fogo'] });
    const pedido = montarPedido(roteiro, { cenas: [6], plano, instrucoes: 'mais sombrio' });
    expect(pedido).toMatch(/somente as cenas 6/);
    expect(pedido).toMatch(/páginas queimadas/);
    expect(pedido).toMatch(/mais sombrio/);
    expect(pedido).toMatch(/PAUSA: pause/);
  });

  it('gera um schema serializável', () => {
    expect(() => JSON.stringify(schemaResposta())).not.toThrow();
  });
});
