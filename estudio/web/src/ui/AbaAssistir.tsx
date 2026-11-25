import { useEffect, useMemo, useRef, useState } from 'react';
import type { Plano } from '../core/tipos';
import { volumeMusica } from '../player/audio';
import { narrador } from '../player/narrador';
import { PlayerCinema } from '../player/cinema';
import { Player } from '../player/player';
import { api } from './api';

export function AbaAssistir({ id, plano }: { id: string; plano: Plano | null }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<Player | PlayerCinema | null>(null);
  const [cena, setCena] = useState(() => {
    // "Assistir a cena" (aba Música e efeitos) deixa aqui a cena por onde começar.
    try {
      const n = Number(sessionStorage.getItem(`estudio-cena-${id}`));
      sessionStorage.removeItem(`estudio-cena-${id}`);
      return n > 0 ? n : 1;
    } catch { return 1; }
  });
  const [tocando, setTocando] = useState(false);
  const [vozes, setVozes] = useState<SpeechSynthesisVoice[]>([]);
  const [voz, setVoz] = useState('');
  const [narrar, setNarrar] = useState(narrador.ativo);
  const [volume, setVolume] = useState(0.7);
  const [gravadas, setGravadas] = useState<{ comAudio: number; total: number } | null>(null);
  const chave = `estudio-vozes-${id}`;
  const [cfg, setCfg] = useState<Record<string, { voz?: string; tom?: number }>>(() => {
    try { return JSON.parse(localStorage.getItem(chave) ?? '{}'); } catch { return {}; }
  });
  useEffect(() => {
    narrador.personagens = cfg;
    try { localStorage.setItem(chave, JSON.stringify(cfg)); } catch { /* sem armazenamento */ }
  }, [cfg, chave]);
  const personagens = useMemo(
    () => [...new Set((plano?.cenas ?? []).flatMap(c => c.passos).flatMap(p => (p.tipo === 'narrar' && p.personagem ? [p.personagem] : [])))],
    [plano],
  );
  const mudarCfg = (nome: string, v: { voz?: string; tom?: number }) => setCfg(c => ({ ...c, [nome]: { ...c[nome], ...v } }));

  useEffect(() => {
    if (!host.current || !plano) return;
    const eventos = { onCena: setCena, onEstado: setTocando };
    const p = plano.formato === 'cinema' ? new PlayerCinema(host.current, eventos) : new Player(host.current, eventos);
    p.carregar(plano);
    // Usa a narração gerada (Piper) quando houver; senão, a voz do navegador.
    Promise.all([api.vozes(id), api.manifestoNarracao(id)])
      .then(([cfg, manifesto]) => narrador.prepararGravada(plano, { projeto: id, cfg, manifesto }))
      .then(r => setGravadas(r))
      .catch(() => setGravadas(null));
    player.current = p;
    return () => { p.destruir(); player.current = null; };
  }, [plano]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const carregar = () => {
      const lista = narrador.vozes();
      if (!lista.length) return;
      if (!narrador.voz) narrador.escolherPadrao();
      setVozes(lista);
      setVoz(narrador.voz?.name ?? '');
    };
    carregar();
    speechSynthesis.addEventListener('voiceschanged', carregar);
    return () => speechSynthesis.removeEventListener('voiceschanged', carregar);
  }, []);

  if (!plano)
    return (
      <div className="vazio">
        <h2>Ainda não há o que assistir</h2>
        <p>Gere e salve o plano de animação primeiro.</p>
        <a className="botao primario" href={`#/p/${id}/plano`}>Ir para o plano</a>
      </div>
    );

  return (
    <div className="assistir">
      <div className="tela" ref={host} />
      <div className="controles">
        {tocando ? (
          <button className="primario" onClick={() => player.current?.parar()}>■ Parar</button>
        ) : (
          <button className="primario" onClick={() => player.current?.tocar(cena)}>▶ {cena > 1 ? `Assistir da cena ${cena}` : 'Assistir'}</button>
        )}
        <label className="campo">Cena
          <select value={cena} disabled={tocando} onChange={e => setCena(Number(e.target.value))}>
            {plano.cenas.map(c => <option key={c.numero} value={c.numero}>{String(c.numero).padStart(2, '0')}</option>)}
          </select>
        </label>
        <label className="campo">Música
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={e => { const v = Number(e.target.value); setVolume(v); volumeMusica(v); }} />
        </label>
        <label className="campo">
          <input type="checkbox" checked={narrar} onChange={e => { narrador.ativo = e.target.checked; setNarrar(e.target.checked); }} /> Narração
        </label>
        {vozes.length > 0 && (
          <label className="campo">Voz
            <select value={voz} onChange={e => { narrador.definir(e.target.value); setVoz(e.target.value); }}>
              {vozes.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {personagens.length > 0 && (
        <details className="vozes-personagens">
          <summary>Vozes dos personagens ({personagens.length})</summary>
          {personagens.map(nome => (
            <div key={nome} className="linha">
              <span className="nome">{nome}</span>
              <label className="campo">Voz
                <select value={cfg[nome]?.voz ?? ''} onChange={e => mudarCfg(nome, { voz: e.target.value || undefined })}>
                  <option value="">Mesma do narrador</option>
                  {vozes.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </label>
              <label className="campo">Tom
                <input type="range" min={0.5} max={1.5} step={0.05} value={cfg[nome]?.tom ?? narrador.tomPadrao(nome)} onChange={e => mudarCfg(nome, { tom: Number(e.target.value) })} />
              </label>
            </div>
          ))}
        </details>
      )}
      <p className="sutil dica">
        {gravadas && gravadas.comAudio > 0
          ? `Narração: vozes do Piper (${gravadas.comAudio} de ${gravadas.total} falas geradas${gravadas.comAudio < gravadas.total ? '; as que faltam usam a voz do navegador' : ''}). `
          : 'Narração: voz do navegador (prévia). Gere a narração na aba Vozes e vídeo para usar as vozes do Piper. '}
      </p>
      <p className="sutil dica">Dica: no Microsoft Edge aparecem vozes "Natural" (ex.: Antonio) bem mais naturais.</p>
    </div>
  );
}
