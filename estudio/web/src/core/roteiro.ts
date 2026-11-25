import type { Aviso, CenaRoteiro, Elemento, Esquema, EstiloFala, Fala, Roteiro, Segmento, Take } from './tipos';

/**
 * Lê um roteiro. Aceita dois estilos (e misturas deles):
 *
 * Livro animado (com Esquemas):
 *   Cena 01:
 *   Narrador V.O
 *   "Texto da narração <Pausa> mais texto"
 *   Esquema de Animação: ...
 *   Esquema de Som: ...
 *
 * Roteiro de cinema (sem Esquemas):
 *   Cena 01:
 *   Ext. Lugar -- Ano 2458 Ao amanhecer.
 *   Ação descrita em texto corrido.
 *   Sons de água batendo no casco
 *   Lia Moreau V.O - Pensamentos
 *   "Pensamento entre aspas"
 *   ORB (Drone) - Falas
 *   -- Fala com travessão
 *   Lembranças de Lia: Gritos, luzes apagando
 *   Nota: comentário de produção (não é narrado)
 *
 * Takes: `Take - 1 <texto> End Take 1`. Marcadores: `<Pausa>`, `<Transição Musical>` etc.
 */
export function lerRoteiro(fonte: string): Roteiro {
  const texto = fonte.replace(/\r\n?/g, '\n');
  const avisos: Aviso[] = [];

  const reCena = /^[ \t]*Cena\s*(\d+)\s*:?[ \t]*$/gim;
  const marcas = [...texto.matchAll(reCena)];

  const cabecalho = (marcas.length ? texto.slice(0, marcas[0].index) : texto).split('\n').map(l => l.trim()).filter(Boolean);
  const ambiente = cabecalho.find(l => reAmbiente.test(l)) ?? '';
  const titulo = (cabecalho.find(l => l !== ambiente) ?? '').replace(/:\s*$/, '');

  if (!marcas.length) avisos.push({ mensagem: 'Nenhuma cena encontrada. Use linhas como "Cena 01:".' });

  const cenas: CenaRoteiro[] = marcas.map((m, i) => {
    const numero = Number(m[1]);
    const inicio = m.index! + m[0].length;
    const fim = i + 1 < marcas.length ? marcas[i + 1].index! : texto.length;
    return lerCena(numero, texto.slice(inicio, fim), avisos);
  });

  cenas.forEach((c, i) => {
    if (i > 0 && c.numero !== cenas[i - 1].numero + 1)
      avisos.push({ cena: c.numero, mensagem: `Numeração fora de sequência (depois da cena ${cenas[i - 1].numero}).` });
  });

  return { titulo, ambiente: ambiente || cenas.flatMap(c => c.elementos).find((e): e is { tipo: 'ambiente'; texto: string } => e.tipo === 'ambiente')?.texto || '', cenas, avisos };
}

const reAmbiente = /^(ext|int|ext\.?\/int|int\.?\/ext)\b\.?\s/i;
const reAnim = /^\s*Esquema\s+de\s+Anima[çc][ãa]o\s*:/i;
const reSom = /^\s*Esquema\s+de\s+Som\s*:/i;
const reLembranca = /^\s*(lembran[çc]as?|mem[óo]rias?|flashback)\b[^:\n]{0,40}:\s*/i;
const reNota = /^\s*(nota|obs(erva[çc][ãa]o)?)\s*:?\s*/i;
const reLinhaSom = /^\s*(sons?|som|ru[íi]dos?|barulho|m[úu]sica|trilha)\b/i;
const reTravessao = /^\s*(--+|[–—])\s*/;
const ABRE = /^\s*["“]/;

/**
 * Linha de personagem: "Narrador V.O", "Lia Moreau V.O - Pensamentos", "ORB (Drone) - Falas".
 * Precisa ter V.O/O.S ou um tipo depois do hífen, para não confundir com uma ação.
 */
const reFalante = /^\s*([^\n"“”<>:]{2,70}?)\s*(\bV\.?\s?O\.?|\bO\.?\s?S\.?|\(off\))?\s*(?:[-–—]\s*(Falas?|Pensamentos?|Narra[çc][ãa]o|Voz|Di[áa]logos?|Off))?\s*:?\s*$/i;

function ehFalante(linha: string) {
  const m = reFalante.exec(linha);
  if (!m || (!m[2] && !m[3])) return null;
  const tipo = (m[3] ?? '').toLowerCase();
  const estilo: EstiloFala = /pensa/.test(tipo) ? 'pensamento' : /fala|di[áa]logo/.test(tipo) ? 'fala' : /narrador/i.test(m[1]) || /narra/.test(tipo) ? 'narracao' : m[2] ? 'pensamento' : 'fala';
  const modo = [m[2] ? m[2].replace(/\s/g, '').toUpperCase().replace(/\.$/, '') : '', m[3] ? m[3][0].toUpperCase() + m[3].slice(1).toLowerCase() : ''].filter(Boolean).join(' · ');
  const personagem = m[1].trim();
  return { personagem, modo, estilo: /^narrador/i.test(personagem) ? 'narracao' : estilo };
}

function lerCena(numero: number, bloco: string, avisos: Aviso[]): CenaRoteiro {
  const linhas = bloco.split('\n');
  const falas: Fala[] = [];
  const elementos: Elemento[] = [];
  let anim = '', som = '';
  let i = 0;

  const empurra = (tipo: Exclude<Elemento['tipo'], 'fala'>, texto: string) => {
    const t = texto.replace(/\s+/g, ' ').trim();
    if (!t) return;
    const ultimo = elementos[elementos.length - 1];
    if (ultimo && ultimo.tipo === tipo && tipo === 'acao') (ultimo as { texto: string }).texto += ' ' + t;
    else elementos.push({ tipo, texto: t });
  };

  /** Lê o conteúdo falado a partir da linha i: blocos entre aspas e/ou linhas com travessão. */
  const lerConteudo = (): string[] => {
    const pecas: string[] = [];
    while (i < linhas.length) {
      const l = linhas[i];
      if (!l.trim()) { i++; continue; }
      if (ABRE.test(l)) {
        let txt = l.replace(ABRE, '');
        let fechou = /["”]\s*$/.test(txt) || /["”]/.test(txt);
        i++;
        while (!fechou && i < linhas.length && !reAnim.test(linhas[i]) && !reSom.test(linhas[i])) {
          txt += '\n' + linhas[i];
          fechou = /["”]/.test(linhas[i]);
          i++;
        }
        const fim = Math.max(txt.lastIndexOf('"'), txt.lastIndexOf('”'));
        pecas.push(fim >= 0 ? txt.slice(0, fim) : txt);
        continue;
      }
      if (reTravessao.test(l)) {
        pecas.push(l.replace(reTravessao, ''));
        i++;
        continue;
      }
      break;
    }
    return pecas;
  };

  while (i < linhas.length) {
    const l = linhas[i];
    const t = l.trim();
    if (!t) { i++; continue; }

    if (reAnim.test(l) || reSom.test(l)) {
      // Esquema: vai até o próximo Esquema ou o fim da cena.
      const ehAnim = reAnim.test(l);
      let txt = l.replace(ehAnim ? reAnim : reSom, '');
      i++;
      while (i < linhas.length && !reAnim.test(linhas[i]) && !reSom.test(linhas[i])) txt += '\n' + linhas[i++];
      if (ehAnim) anim += (anim ? '\n\n' : '') + txt.trim();
      else som += (som ? '\n\n' : '') + txt.trim();
      continue;
    }

    const falante = ehFalante(t);
    if (falante) {
      i++;
      const pecas = lerConteudo();
      if (!pecas.length) avisos.push({ cena: numero, mensagem: `"${falante.personagem}" não tem fala logo abaixo.` });
      else {
        falas.push({ ...falante, takes: juntarPecas(pecas) });
        elementos.push({ tipo: 'fala', indice: falas.length - 1 });
      }
      continue;
    }

    if (ABRE.test(l) || reTravessao.test(l)) {
      const pecas = lerConteudo();
      const anterior = [...elementos].reverse().find(e => e.tipo === 'fala');
      const dono = anterior && anterior.tipo === 'fala' && elementos[elementos.length - 1] === anterior ? falas[anterior.indice] : null;
      if (dono) dono.takes = juntarPecas([...dono.takes.map(tk => tk.segmentos.map(s => (s.tipo === 'texto' ? s.texto : `<${s.rotulo}>`)).join(' ')), ...pecas]);
      else {
        avisos.push({ cena: numero, mensagem: 'Fala sem personagem identificado; considerado "Narrador V.O".' });
        falas.push({ personagem: 'Narrador', modo: 'V.O', estilo: 'narracao', takes: juntarPecas(pecas) });
        elementos.push({ tipo: 'fala', indice: falas.length - 1 });
      }
      continue;
    }

    if (reAmbiente.test(t)) { empurra('ambiente', t); i++; continue; }
    if (reLembranca.test(t)) {
      let txt = t.replace(reLembranca, '');
      i++;
      while (i < linhas.length && linhas[i].trim() && !ehFalante(linhas[i].trim()) && !/^\s*cena\b/i.test(linhas[i])) txt += ' ' + linhas[i++].trim();
      empurra('lembranca', txt);
      continue;
    }
    if (reNota.test(t) && /^\s*(nota|obs)/i.test(t)) {
      let txt = t.replace(reNota, '');
      i++;
      while (i < linhas.length && linhas[i].trim() && !ehFalante(linhas[i].trim())) txt += ' ' + linhas[i++].trim();
      if (!txt.trim()) while (i < linhas.length && !linhas[i].trim()) i++;
      while (!txt.trim() && i < linhas.length && linhas[i].trim()) txt += ' ' + linhas[i++].trim();
      empurra('nota', txt);
      continue;
    }
    empurra(reLinhaSom.test(t) ? 'som' : 'acao', t);
    i++;
  }

  // Sem Esquemas, a descrição visual e sonora vem dos elementos da cena.
  const textos = (tipos: Elemento['tipo'][]) =>
    elementos.filter(e => tipos.includes(e.tipo) && e.tipo !== 'fala').map(e => (e.tipo === 'lembranca' ? `Lembrança: ${(e as { texto: string }).texto}` : (e as { texto: string }).texto)).join(' ');
  const animacao = lerEsquema(anim || textos(['ambiente', 'acao', 'lembranca']));
  const somEsq = lerEsquema(som || textos(['som', 'lembranca']));

  if (!falas.length && !elementos.length && !anim && !som) avisos.push({ cena: numero, mensagem: 'Cena vazia.' });
  if (!anim && som && falas.length) avisos.push({ cena: numero, mensagem: 'Cena sem "Esquema de Animação".' });
  if (anim && !som) avisos.push({ cena: numero, mensagem: 'Cena sem "Esquema de Som".' });

  return { numero, falas, elementos, animacao, som: somEsq };
}

/** Junta as peças de uma fala (aspas ou travessões) em takes; entre peças entra um respiro. */
function juntarPecas(pecas: string[]): Take[] {
  if (pecas.length === 1) return lerTakes(pecas[0]);
  const comTakes = pecas.map(lerTakes);
  if (comTakes.some(t => t.length > 1)) return comTakes.flat();
  const segmentos: Segmento[] = [];
  comTakes.forEach((t, i) => {
    if (i > 0 && segmentos.length) segmentos.push({ tipo: 'pausa', rotulo: 'respiro' });
    segmentos.push(...t[0].segmentos);
  });
  return [{ numero: 1, segmentos }];
}

const reTake = /Take\s*-?\s*(\d+)\s*<([\s\S]*?)>\s*(?:End|Ene)\s*Take\s*-?\s*\d*\s*-?/gi;

function lerTakes(corpo: string): Take[] {
  const takes = [...corpo.matchAll(reTake)];
  if (!takes.length) return [{ numero: 1, segmentos: lerSegmentos(corpo) }];
  return takes.map(t => ({ numero: Number(t[1]), segmentos: lerSegmentos(t[2]) }));
}

export function lerSegmentos(s: string): Segmento[] {
  const out: Segmento[] = [];
  const reMarca = /<\s*([^<>]*?)\s*>/g;
  let ultimo = 0;
  const empurraTexto = (t: string) => {
    const limpo = t.replace(/[<>*"“”]/g, ' ').replace(/\s+/g, ' ').trim();
    if (limpo) out.push({ tipo: 'texto', texto: limpo });
  };
  for (const m of s.matchAll(reMarca)) {
    empurraTexto(s.slice(ultimo, m.index));
    const rotulo = m[1].trim();
    if (/^paus|^respiro/i.test(rotulo)) out.push({ tipo: 'pausa', rotulo });
    else if (/transi/i.test(rotulo)) out.push({ tipo: 'transicao', rotulo });
    else if (rotulo) out.push({ tipo: 'marcador', rotulo });
    ultimo = m.index! + m[0].length;
  }
  empurraTexto(s.slice(ultimo));
  return out;
}

function lerEsquema(texto: string): Esquema {
  const limpo = texto.replace(/\n{3,}/g, '\n\n').trim();
  const porTake: Record<number, string> = {};
  const marcas = [...limpo.matchAll(/(?:^|\n|\.\s*)\s*Take\s*-?\s*(\d+)\s*-/gi)];
  marcas.forEach((m, i) => {
    const ini = m.index! + m[0].length;
    const fim = i + 1 < marcas.length ? marcas[i + 1].index! : limpo.length;
    porTake[Number(m[1])] = limpo
      .slice(ini, fim)
      .replace(/-?\s*End\s*Take\s*-?\s*\d*\s*\.?\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  });
  return { texto: limpo, porTake };
}

/** Texto falado de um take (sem marcadores). */
export function textoDoTake(t: Take): string {
  return t.segmentos.filter(s => s.tipo === 'texto').map(s => (s as { texto: string }).texto).join(' ');
}
