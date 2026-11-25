// ===== Roteiro (resultado do leitor do texto do roteiro) =====

export type Segmento =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'pausa'; rotulo: string }
  | { tipo: 'transicao'; rotulo: string }
  | { tipo: 'marcador'; rotulo: string };

export interface Take {
  numero: number;
  segmentos: Segmento[];
}

export type EstiloFala = 'narracao' | 'pensamento' | 'fala';

export interface Fala {
  personagem: string; // ex.: "Narrador", "Lia Moreau"
  modo: string; // ex.: "V.O", "V.O · Pensamentos", "Falas"
  estilo: EstiloFala;
  takes: Take[];
}

/** Tudo o que acontece numa cena, na ordem em que aparece no roteiro. */
export type Elemento =
  | { tipo: 'fala'; indice: number } // índice em CenaRoteiro.falas
  | { tipo: 'ambiente' | 'acao' | 'som' | 'lembranca' | 'nota'; texto: string };

export interface Esquema {
  texto: string; // texto completo
  porTake: Record<number, string>; // quando o esquema é dividido em "Take N - ..."
}

export interface CenaRoteiro {
  numero: number;
  falas: Fala[];
  elementos: Elemento[];
  animacao: Esquema; // "Esquema de Animação" ou, sem ele, as ações/ambiente/lembranças da cena
  som: Esquema; // "Esquema de Som" ou, sem ele, os sons/lembranças da cena
}

export interface Aviso {
  cena?: number;
  mensagem: string;
}

export interface Roteiro {
  titulo: string;
  ambiente: string; // ex.: "Ext. Uma Folha de Livro antiga"
  cenas: CenaRoteiro[];
  avisos: Aviso[];
}

// ===== Plano de animação (o que o player executa) =====

export type FonteIlustracao = 'esboco' | 'imagem' | 'svg';

export interface Ilustracao {
  descricao: string;
  fonte: FonteIlustracao;
  src?: string; // para fonte "imagem"
  svg?: string; // para fonte "svg" (conteúdo interno, viewBox 0 0 440 600 ou do slot)
}

export interface Pagina {
  layout: 'inteira' | 'dividida';
  ilustracoes: Ilustracao[]; // inteira: 1; dividida: [topo, base]
  sangue?: number; // 0..3 manchas já presentes na página
  bordaQueimada?: boolean;
  escura?: boolean;
  desfocada?: boolean;
}

export type Faixa = 'calma' | 'guerra' | 'esperanca' | 'agonia' | 'perseguicao' | 'fogo' | 'suave';
export type Velocidade = 'lenta' | 'normal' | 'rapida' | 'relampago';

export type Passo =
  | { tipo: 'abrirLivro'; pagina: Pagina }
  | { tipo: 'fecharLivro' }
  | { tipo: 'virarPagina'; pagina: Pagina; velocidade?: Velocidade; manterTexto?: boolean }
  | { tipo: 'rasgarPagina'; pagina: Pagina }
  | { tipo: 'queimarPaginas' }
  | { tipo: 'surgirDasCinzas'; pagina: Pagina }
  | { tipo: 'narrar'; texto: string; velocidade?: number; legenda?: boolean; personagem?: string; estilo?: EstiloFala }
  | { tipo: 'pausa'; ms: number }
  | { tipo: 'musica'; faixa: Faixa; acao: 'tocar' | 'parar'; fade?: number; volume?: number }
  | { tipo: 'musicaAjuste'; faixa: Faixa; volume?: number; intensidade?: number; andamento?: number; duracao?: number }
  | { tipo: 'efeito'; efeito: Efeito; intensidade?: number }
  /** Efeito sonoro do estúdio (som) ou arquivo enviado (src). Com loop, toca até um "parar" com o mesmo som/src. */
  | { tipo: 'som'; som?: Som; src?: string; nome?: string; acao?: 'tocar' | 'parar'; volume?: number; loop?: boolean; canal?: 'efeitos' | 'musica'; fade?: number }
  // ----- formato cinematográfico -----
  | { tipo: 'mostrar'; ilustracao: Ilustracao; transicao?: Transicao; movimento?: Movimento; escura?: boolean; desfocada?: boolean }
  | { tipo: 'camera'; movimento: Movimento; duracao?: number }
  | { tipo: 'tremor'; intensidade?: number }
  | { tipo: 'titulo'; texto: string; subtitulo?: string }
  | { tipo: 'escurecer'; cor?: 'preto' | 'branco'; duracao?: number };

export type Som =
  | 'trovao' | 'vento' | 'chuva' | 'fogueira' | 'coracao' | 'passos' | 'porta' | 'sino' | 'espada'
  | 'magia' | 'sussurro' | 'impacto' | 'explosao' | 'pagina' | 'rasgo' | 'suspense' | 'tique';

/** Volumes gerais do plano (1 = padrão). */
export interface Mixagem { musica?: number; efeitos?: number; voz?: number }

export type Efeito = 'sangue' | 'fogo' | 'apagarFogo' | 'brilho' | 'focar' | 'perfurar' | 'clarao' | 'fim';

/** Formato de apresentação do plano. */
export type Formato = 'livro' | 'cinema';
/** Como a imagem nova entra (cinema). */
export type Transicao = 'corte' | 'fusao' | 'preto' | 'branco' | 'deslize';
/** Movimento de câmera contínuo sobre a imagem (cinema). */
export type Movimento = 'parado' | 'aproximar' | 'afastar' | 'esquerda' | 'direita' | 'subir' | 'descer' | 'aproximarRapido';

export const PASSOS_LIVRO = ['abrirLivro', 'fecharLivro', 'virarPagina', 'rasgarPagina', 'queimarPaginas', 'surgirDasCinzas'] as const;
export const PASSOS_CINEMA = ['mostrar', 'camera', 'tremor', 'titulo', 'escurecer'] as const;

export interface CenaPlano {
  numero: number;
  passos: Passo[];
}

export interface Plano {
  versao: 1;
  titulo: string;
  geradoEm: string;
  origem: 'automatico' | 'ia' | 'manual';
  formato?: Formato; // padrão: 'livro'
  roteiroHash?: string; // hash do roteiro de onde o plano saiu (para avisar quando ficar desatualizado)
  mixagem?: Mixagem;
  cenas: CenaPlano[];
}

// ===== Projeto =====

export interface Projeto {
  id: string;
  nome: string;
  /** Grupo (pasta) em que o projeto aparece na tela inicial. */
  grupo?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ProjetoCompleto {
  projeto: Projeto;
  roteiro: string;
  plano: Plano | null;
}

// ===== Elenco e estilo visual (consistência das ilustrações) =====

export interface Personagem {
  nome: string;
  descricao: string; // aparência fixa: corpo, rosto, cabelo, roupa, cores, objetos marcantes
  referencia?: string; // imagem de referência (folha do personagem) em /arquivos/<projeto>/...
}

export interface Elenco {
  estilo: string; // como as ilustrações devem parecer (traço, cores, clima)
  personagens: Personagem[];
}

export const ESTILO_PADRAO =
  'Ilustração de livro antigo feita à pena: traço de tinta sépia escura, hachuras para sombras, ' +
  'poucos toques de aquarela em cores terrosas e um destaque de cor por cena. Fundo do papel aparecendo (sem pintar o fundo inteiro).';
