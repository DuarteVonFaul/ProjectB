import { describe, expect, it } from 'vitest';
import { montarPromptFolha, montarPromptImagem, proporcaoDoLayout } from '../web/src/core/promptImagem';
import type { Elenco } from '../web/src/core/tipos';

const elenco: Elenco = {
  estilo: 'Anime sombrio, cores frias.',
  personagens: [
    { nome: 'Lia Moreau', descricao: 'Mulher jovem, cabelo preto curto, cicatriz.', referencia: '/arquivos/p/ref-lia.png' },
    { nome: 'ORB (Orbital Reconnaissance Bot)', descricao: 'Drone com olho vermelho.' },
    { nome: 'Barqueiro', descricao: 'Figura encapuzada.' },
  ],
};

describe('montarPromptImagem', () => {
  it('leva estilo, cena e só os personagens citados', () => {
    const p = montarPromptImagem({ descricao: 'Lia olha para o drone ORB no barco.', layout: 'inteira' }, elenco);
    expect(p.proporcao).toBe('3:4');
    expect(p.texto).toMatch(/Anime sombrio/);
    expect(p.texto).toMatch(/Lia Moreau: Mulher jovem/);
    expect(p.texto).toMatch(/ORB .*Drone com olho vermelho/);
    expect(p.texto).not.toMatch(/Barqueiro/);
    expect(p.texto).toMatch(/Sem texto/);
    expect(p.referencias.map(r => r.nome)).toEqual(['Lia Moreau']);
  });

  it('usa paisagem para página dividida', () => {
    expect(proporcaoDoLayout('dividida')).toBe('3:2');
  });

  it('monta o prompt da folha de personagem', () => {
    expect(montarPromptFolha(elenco.personagens[0], elenco.estilo)).toMatch(/corpo inteiro.*fundo liso/s);
  });
});
