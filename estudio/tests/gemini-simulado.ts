/**
 * Gemini simulado (API "interactions") para testar sem custo.
 * Uso: npx tsx tests/gemini-simulado.ts  → escuta em http://127.0.0.1:5199/v1beta/interactions
 * e no estúdio: ESTUDIO_GEMINI_URL=http://127.0.0.1:5199/v1beta/interactions ESTUDIO_GEMINI_CHAVE=teste
 * Devolve um PNG com um degradê; a cor muda com o pedido e as faixas brancas mostram quantas referências chegaram.
 */
import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function png(w: number, h: number, cor: [number, number, number], faixas: number) {
  const linhas = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    linhas[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      const faixa = faixas > 0 && y < 12 && x < faixas * 30 && x % 30 < 24;
      const k = 0.5 + (0.5 * (x + y)) / (w + h);
      linhas[i] = faixa ? 255 : Math.round(cor[0] * k);
      linhas[i + 1] = faixa ? 255 : Math.round(cor[1] * k);
      linhas[i + 2] = faixa ? 255 : Math.round(cor[2] * k);
    }
  }
  const pedaco = (tipo: string, dados: Buffer) => {
    const t = Buffer.concat([Buffer.from(tipo), dados]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(t));
    return Buffer.concat([len, t, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', ihdr), pedaco('IDAT', deflateSync(linhas)), pedaco('IEND', Buffer.alloc(0))]);
}

createServer((req, res) => {
  let corpo = '';
  req.on('data', d => (corpo += d));
  req.on('end', () => {
    const j = JSON.parse(corpo || '{}');
    if (req.headers['x-goog-api-key'] !== 'teste') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'API key not valid.' } }));
    }
    const texto: string = j.input?.find((p: any) => p.type === 'text')?.text ?? '';
    const refs = (j.input ?? []).filter((p: any) => p.type === 'image').length;
    const [a, b] = String(j.response_format?.aspect_ratio ?? '1:1').split(':').map(Number);
    const w = 240, h = Math.round((w * b) / a);
    let hsh = 0;
    for (const c of texto) hsh = (hsh * 31 + c.charCodeAt(0)) | 0;
    const cor: [number, number, number] = [80 + (Math.abs(hsh) % 170), 80 + (Math.abs(hsh >> 8) % 170), 80 + (Math.abs(hsh >> 16) % 170)];
    console.log(`[gemini simulado] ${j.model} ${j.response_format?.aspect_ratio} refs=${refs} :: ${texto.slice(0, 60).replace(/\n/g, ' ')}`);
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'image', data: png(w, h, cor, refs).toString('base64') }] }] }));
    }, 800);
  });
}).listen(5199, '127.0.0.1', () => console.log('Gemini simulado em http://127.0.0.1:5199/v1beta/interactions'));
