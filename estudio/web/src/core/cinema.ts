import type { CenaPlano, Ilustracao, Movimento, Pagina, Passo, Plano } from './tipos';

/**
 * Formato cinematográfico: tela cheia, uma imagem por plano (shot), movimento de câmera,
 * cortes/fusões, legendas. Aqui fica a conversão de um plano de livro para cinema,
 * que reaproveita direção, narração, música e ilustrações já prontas.
 */

const CICLO: Movimento[] = ['aproximar', 'esquerda', 'afastar', 'direita', 'subir', 'aproximar', 'descer'];

export function livroParaCinema(plano: Plano): Plano {
  let ciclo = 0;
  const proximoMovimento = (rapido = false): Movimento => (rapido ? 'aproximarRapido' : CICLO[ciclo++ % CICLO.length]);

  const mostrarPagina = (pg: Pagina, transicao: Extract<Passo, { tipo: 'mostrar' }>['transicao'], rapido = false): { agora: Passo[]; depois: Passo[] } => {
    const ils = pg.ilustracoes.filter(Boolean) as Ilustracao[];
    const extras: Passo[] = [];
    if (pg.sangue) extras.push({ tipo: 'efeito', efeito: 'sangue', intensidade: pg.sangue });
    if (pg.bordaQueimada) extras.push({ tipo: 'efeito', efeito: 'fogo', intensidade: 0.4 });
    const shot = (il: Ilustracao, t: typeof transicao): Passo => ({
      tipo: 'mostrar',
      ilustracao: il,
      transicao: t,
      movimento: proximoMovimento(rapido),
      ...(pg.escura ? { escura: true } : {}),
      ...(pg.desfocada ? { desfocada: true } : {}),
    });
    if (!ils.length) return { agora: [...extras], depois: [] }; // página só de sangue
    return {
      agora: [shot(ils[0], transicao), ...extras],
      // Página dividida: a parte de baixo vira o plano seguinte, depois da próxima fala.
      depois: ils.slice(1).map(il => shot(il, 'fusao')),
    };
  };

  const cenas: CenaPlano[] = plano.cenas.map((c, ci) => {
    const passos: Passo[] = [];
    let pendentes: Passo[] = [];
    const soltar = () => { passos.push(...pendentes); pendentes = []; };

    for (const p of c.passos) {
      switch (p.tipo) {
        case 'abrirLivro': {
          soltar();
          if (ci === 0 && plano.titulo) passos.push({ tipo: 'titulo', texto: plano.titulo });
          const m = mostrarPagina(p.pagina, 'preto');
          passos.push(...m.agora);
          pendentes = m.depois;
          break;
        }
        case 'virarPagina': {
          soltar();
          const v = p.velocidade ?? 'normal';
          const m = mostrarPagina(p.pagina, v === 'relampago' || v === 'rapida' ? 'corte' : 'fusao', v === 'relampago');
          passos.push(...m.agora);
          pendentes = m.depois;
          break;
        }
        case 'rasgarPagina': {
          soltar();
          passos.push({ tipo: 'tremor', intensidade: 1.2 });
          const m = mostrarPagina(p.pagina, 'branco');
          passos.push(...m.agora);
          pendentes = m.depois;
          break;
        }
        case 'surgirDasCinzas': {
          soltar();
          passos.push({ tipo: 'efeito', efeito: 'apagarFogo' });
          const m = mostrarPagina(p.pagina, 'preto');
          passos.push(...m.agora);
          pendentes = m.depois;
          break;
        }
        case 'queimarPaginas':
          soltar();
          passos.push({ tipo: 'efeito', efeito: 'fogo', intensidade: 1.3 }, { tipo: 'pausa', ms: 2200 }, { tipo: 'escurecer', cor: 'preto', duracao: 2 });
          break;
        case 'fecharLivro':
          soltar();
          passos.push({ tipo: 'escurecer', cor: 'preto', duracao: 3 });
          break;
        case 'narrar':
          passos.push(p);
          soltar();
          break;
        default:
          passos.push(p);
      }
    }
    soltar();
    return { numero: c.numero, passos };
  });

  return { ...plano, formato: 'cinema', cenas, geradoEm: new Date().toISOString() };
}

export const ehCinema = (p: Plano | null | undefined) => p?.formato === 'cinema';

/** Ilustrações de um passo visual (página do livro ou plano de cinema), ou null se não for visual. */
export function ilustracoesDoPasso(p: Passo): Ilustracao[] | null {
  if ('pagina' in p) return p.pagina.ilustracoes;
  if (p.tipo === 'mostrar') return [p.ilustracao];
  return null;
}

/** Devolve o passo com as ilustrações trocadas (mantém o tipo do passo). */
export function comIlustracoes(p: Passo, ils: Ilustracao[]): Passo {
  if ('pagina' in p) return { ...p, pagina: { ...p.pagina, ilustracoes: ils } };
  if (p.tipo === 'mostrar') return { ...p, ilustracao: ils[0] ?? p.ilustracao };
  return p;
}
