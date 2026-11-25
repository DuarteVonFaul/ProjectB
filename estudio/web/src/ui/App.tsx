import { useEffect, useState } from 'react';
import { EditorProjeto } from './EditorProjeto';
import { ListaProjetos } from './ListaProjetos';
import { PaginaExportacao } from './PaginaExportacao';

/** Rotas por hash: #/  e  #/p/<id>/<aba> */
function lerRota() {
  const m = /^#\/p\/([^/]+)(?:\/(\w+))?/.exec(location.hash);
  return m ? { id: m[1], aba: (m[2] as Aba) || 'roteiro' } : null;
}
export type Aba = 'roteiro' | 'elenco' | 'plano' | 'som' | 'assistir' | 'video';

export function App() {
  const [rota, setRota] = useState(lerRota);
  useEffect(() => {
    const f = () => setRota(lerRota());
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  const exp = /^#\/exportar\/([\w-]+)\?tarefa=([\w-]+)/.exec(location.hash);
  if (exp) return <PaginaExportacao id={exp[1]} tarefa={exp[2]} />;
  return rota ? <EditorProjeto key={rota.id} id={rota.id} aba={rota.aba} /> : <ListaProjetos />;
}

export const ir = (hash: string) => {
  location.hash = hash;
};
