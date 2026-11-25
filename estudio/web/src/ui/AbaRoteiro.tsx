import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { lerRoteiro, textoDoTake } from '../core/roteiro';

const ROTULOS = { ambiente: 'Ambiente', acao: 'Ação', som: 'Som', lembranca: 'Lembrança', nota: 'Nota' } as const;

const MODELO = `Título - Capítulo 1:

Ext. Ambiente da história

Cena 01:

Narrador V.O
"Texto da narração. <Pausa> Continuação depois da pausa."

Esquema de Animação: Passa a página ilustrando ...
Esquema de Som: Música calma ...
`;

export function AbaRoteiro({ texto, onTexto, sujo, onSalvar }: { texto: string; onTexto: (t: string) => void; sujo: boolean; onSalvar: () => Promise<void> }) {
  const adiado = useDeferredValue(texto);
  const roteiro = useMemo(() => lerRoteiro(adiado), [adiado]);
  const [estado, setEstado] = useState<'' | 'salvando' | 'salvo' | 'erro'>('');

  async function salvar() {
    setEstado('salvando');
    try {
      await onSalvar();
      setEstado('salvo');
      setTimeout(() => setEstado(''), 1800);
    } catch {
      setEstado('erro');
    }
  }

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        salvar();
      }
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  });

  return (
    <div className="roteiro">
      <section className="painel-texto">
        <div className="barra">
          <span className="sutil">Cena NN · Personagem V.O / - Falas · "texto" ou -- fala · &lt;Pausa&gt; · Esquema de Animação/Som ou ações, sons e Lembranças em texto livre</span>
          <div className="direita">
            {estado === 'salvo' && <span className="ok">Salvo</span>}
            {estado === 'erro' && <span className="erro">Não foi possível salvar. Tente de novo.</span>}
            <button className="primario" onClick={salvar} disabled={estado === 'salvando'}>{sujo ? 'Salvar roteiro' : 'Salvo'}</button>
          </div>
        </div>
        <textarea
          value={texto}
          onChange={e => onTexto(e.target.value)}
          spellCheck
          placeholder={MODELO}
          aria-label="Texto do roteiro"
        />
      </section>

      <aside className="painel-leitura" aria-label="Como o estúdio entendeu o roteiro">
        <h2>{roteiro.titulo || 'Sem título'}</h2>
        {roteiro.ambiente && <p className="sutil">{roteiro.ambiente}</p>}
        {roteiro.avisos.length > 0 && (
          <ul className="avisos">
            {roteiro.avisos.map((a, i) => <li key={i}>{a.cena ? `Cena ${a.cena}: ` : ''}{a.mensagem}</li>)}
          </ul>
        )}
        {roteiro.cenas.map(c => (
          <article key={c.numero} className="cena-lida">
            <h3>Cena {String(c.numero).padStart(2, '0')}</h3>
            {c.elementos.map((e, i) => {
              if (e.tipo !== 'fala')
                return (
                  <p key={i} className={`elemento ${e.tipo}`}>
                    <span className="rotulo">{ROTULOS[e.tipo]}</span> {e.texto}
                  </p>
                );
              const f = c.falas[e.indice];
              return (
                <div key={i} className={`fala-lida ${f.estilo}`}>
                  <div className="rotulo">{f.personagem}{f.modo ? ` · ${f.modo}` : ''}</div>
                  {f.takes.map(t => (
                    <div key={t.numero} className="take">
                      {f.takes.length > 1 && <span className="selo">Take {t.numero}</span>}
                      {t.segmentos.map((s, j) =>
                        s.tipo === 'texto' ? <span key={j}>{s.texto} </span> : <span key={j} className={`marca ${s.tipo}`}>{s.rotulo}</span>,
                      )}
                      {!textoDoTake(t) && <span className="sutil">(sem texto)</span>}
                    </div>
                  ))}
                </div>
              );
            })}
            {c.elementos.every(e => e.tipo === 'fala') && c.animacao.texto && <p><span className="rotulo">Animação</span> {c.animacao.texto}</p>}
            {c.elementos.every(e => e.tipo === 'fala') && c.som.texto && <p><span className="rotulo">Som</span> {c.som.texto}</p>}
          </article>
        ))}
      </aside>
    </div>
  );
}
