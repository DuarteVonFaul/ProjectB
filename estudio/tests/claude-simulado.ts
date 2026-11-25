/**
 * CLI do Claude simulada, para testar a integração sem gastar o plano.
 * Uso: ESTUDIO_CLAUDE=tests/claude-simulado.ts
 * - `auth status` responde logado.
 * - `-p`: lê o pedido do stdin e devolve o plano do diretor automático.
 *   Na 1ª tentativa omite a última cena (para exercitar a correção); na 2ª devolve completo.
 */
import { gerarPlano } from '../web/src/core/diretor';
import { lerRoteiro } from '../web/src/core/roteiro';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === 'auth') {
  console.log(JSON.stringify({ loggedIn: true, authMethod: 'simulado' }));
  process.exit(0);
}

let entrada = '';
process.stdin.on('data', d => (entrada += d));
const responder = (dados: unknown, ms = 1500) =>
  setTimeout(() => console.log(JSON.stringify({ type: 'result', is_error: false, structured_output: dados, total_cost_usd: 0, duration_ms: ms })), ms);
const schema = args[args.indexOf('--json-schema') + 1] ?? '';

process.stdin.on('end', () => {
  if (schema.includes('"svg"')) {
    const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(entrada) ?? ['', '388', '544'];
    const n = (entrada.length % 5) + 3;
    const formas = Array.from({ length: n }, (_, i) => `<circle cx="${40 + i * 50}" cy="${Number(h) / 2}" r="${20 + i * 4}" fill="#b4842c" fill-opacity=".4" stroke="#2b1a10" stroke-width="2"/>`).join('');
    return responder({ svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g"><stop offset="0" stop-color="#2b1a10"/></linearGradient></defs><path d="M10 ${Number(h) - 20} Q ${Number(w) / 2} 20 ${Number(w) - 10} ${Number(h) - 20}" fill="none" stroke="url(#g)" stroke-width="3"/>${formas}</svg>` }, 1200);
  }
  if (schema.includes('"personagens"'))
    return responder({ estilo: 'Traço de pena sépia, hachuras, toques de vermelho.', personagens: [{ nome: 'Lia Moreau', descricao: 'Mulher jovem, cabelo negro curto, cicatriz na bochecha, traje tático cinza.' }, { nome: 'ORB', descricao: 'Drone de metal escuro com segmentos como vértebras e um olho vermelho.' }] });
  const roteiro = lerRoteiro(readFileSync(new URL('../exemplos/prologo-virtus.txt', import.meta.url), 'utf8'));
  const pedidas = [...entrada.matchAll(/"numero": (\d+)/g)].map(m => Number(m[1]));
  const plano = gerarPlano(roteiro);
  let cenas = plano.cenas.filter(c => pedidas.includes(c.numero));
  const correcao = entrada.includes('Problemas encontrados');
  if (!correcao && cenas.length > 1) cenas = cenas.slice(0, -1);
  cenas.forEach(c => c.passos.forEach(p => {
    if ('pagina' in p) p.pagina.ilustracoes.forEach(i => (i.descricao = `[IA] ${i.descricao}`));
  }));
  setTimeout(() => {
    console.log(JSON.stringify({ type: 'result', is_error: false, structured_output: { cenas }, total_cost_usd: 0, duration_ms: 1500 }));
  }, 1500);
});
