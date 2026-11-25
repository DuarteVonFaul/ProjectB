import { useEffect, useRef, useState } from 'react';
import type { Plano } from '../core/tipos';
import type { ConfigVozes, ManifestoNarracao } from '../core/vozes';
import { audio, fluxoDeSaida, volumeMusica } from '../player/audio';
import { PlayerCinema } from '../player/cinema';
import { narrador } from '../player/narrador';
import { Player } from '../player/player';

/**
 * Página aberta pelo navegador invisível (Edge, via Playwright) durante a exportação.
 * Toca o plano salvo do início ao fim em 1280x720, grava todo o som do estúdio
 * e anota quando cada fala começa e termina (para as legendas do vídeo).
 */

interface LegendaGravada { texto: string; personagem?: string; estilo?: string; ini: number; fim: number }

declare global {
  interface Window {
    __estudio?: { pronto: boolean; erro?: string; fim?: boolean; iniciar?: () => void; resultado?: { t0Epoch: number; duracaoMs: number; legendas: LegendaGravada[] } };
  }
}

export function PaginaExportacao({ id, tarefa }: { id: string; tarefa: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState('Preparando…');

  useEffect(() => {
    // Em desenvolvimento o React monta a página duas vezes: só a montagem ativa pode criar o player.
    let ativo = true;
    let criado: { destruir: () => void } | null = null;
    const estado: NonNullable<Window['__estudio']> = { pronto: false };
    window.__estudio = estado;
    document.body.style.margin = '0';
    document.body.style.background = '#000';
    (async () => {
      try {
        const [dados, cfg, manifesto] = await Promise.all([
          fetch(`/api/projetos/${id}`).then(r => r.json()),
          fetch(`/api/projetos/${id}/vozes`).then(r => r.json() as Promise<ConfigVozes>),
          fetch(`/api/projetos/${id}/narracao`).then(r => r.json() as Promise<ManifestoNarracao>),
        ]);
        const plano = dados.plano as Plano;
        if (!plano) throw new Error('O projeto não tem plano salvo.');
        audio();
        volumeMusica(0.7);
        narrador.ativo = true;
        const prep = await narrador.prepararGravada(plano, { projeto: id, cfg, manifesto });
        if (prep.comAudio < prep.total) throw new Error(`Faltam ${prep.total - prep.comAudio} falas sem áudio gerado.`);

        const legendas: LegendaGravada[] = [];
        let t0 = 0;
        const eventos = {
          onCena: (n: number) => console.log(`CENA ${n}`),
          onFala: (f: { texto: string; personagem?: string; estilo?: string; inicio: number }) => legendas.push({ ...f, ini: f.inicio - t0, fim: 0 }),
          onFalaFim: (fim: number) => { const l = legendas[legendas.length - 1]; if (l) l.fim = fim - t0; },
        };
        if (!ativo) return;
        const player = plano.formato === 'cinema' ? new PlayerCinema(host.current!, eventos) : new Player(host.current!, eventos);
        criado = player;
        if (player instanceof PlayerCinema) player.semLegenda = true;
        player.carregar(plano);
        setMsg('');

        estado.iniciar = async () => {
          const gravador = new MediaRecorder(fluxoDeSaida(), { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
          const partes: Blob[] = [];
          gravador.ondataavailable = e => e.data.size && partes.push(e.data);
          const parou = new Promise(r => (gravador.onstop = r));
          await audio().resume();
          gravador.start(1000);
          t0 = performance.now();
          const t0Epoch = performance.timeOrigin + t0;
          await player.tocar(1);
          await new Promise(r => setTimeout(r, 2500)); // respiro no fim
          const duracaoMs = performance.now() - t0;
          gravador.stop();
          await parou;
          await fetch(`/api/projetos/${id}/exportacoes/${tarefa}/audio`, { method: 'PUT', headers: { 'X-Estudio': '1' }, body: new Blob(partes, { type: 'audio/webm' }) });
          estado.resultado = { t0Epoch, duracaoMs, legendas };
          estado.fim = true;
        };
        estado.pronto = true;
      } catch (e) {
        if (!ativo) return;
        estado.erro = (e as Error).message;
        setMsg((e as Error).message);
      }
    })();
    return () => {
      ativo = false;
      criado?.destruir();
    };
  }, [id, tarefa]);

  return (
    <div style={{ position: 'fixed', inset: 0, width: 1280, height: 720, overflow: 'hidden', background: '#000' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {msg && <p style={{ position: 'absolute', left: 20, top: 10, color: '#fff', font: '16px sans-serif' }}>{msg}</p>}
    </div>
  );
}
