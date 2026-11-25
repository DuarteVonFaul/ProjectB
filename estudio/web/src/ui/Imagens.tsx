import { useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface StatusImagens {
  configurado: boolean;
  modelo: string;
  mensagem: string;
}

/** Status do Gemini (se há chave configurada em estudio/.env). */
export function useStatusImagens() {
  const [status, setStatus] = useState<StatusImagens | null>(null);
  useEffect(() => {
    api.statusImagens().then(setStatus).catch(() => setStatus({ configurado: false, modelo: '', mensagem: 'Não foi possível consultar o Gemini.' }));
  }, []);
  return status;
}

const pegarImagem = (lista: FileList | DataTransferItemList | null | undefined): File | null => {
  if (!lista) return null;
  for (const it of Array.from(lista as ArrayLike<File | DataTransferItem>)) {
    const f = it instanceof File ? it : it.kind === 'file' ? it.getAsFile() : null;
    if (f && /^image\//.test(f.type)) return f;
  }
  return null;
};

/**
 * Área que aceita imagem arrastada, colada (Ctrl+V com a área selecionada) ou escolhida no computador.
 * Feita para o vaivém com o app do Gemini: copiar o prompt, gerar lá, colar aqui.
 */
export function ZonaImagem({ onArquivo, ocupado, children, rotulo = 'Arraste, cole (Ctrl+V) ou escolha uma imagem' }: { onArquivo: (f: File) => void; ocupado?: boolean; children?: ReactNode; rotulo?: string }) {
  const [sobre, setSobre] = useState(false);
  return (
    <div
      className={`zona-imagem${sobre ? ' sobre' : ''}`}
      tabIndex={0}
      onDragOver={e => { e.preventDefault(); setSobre(true); }}
      onDragLeave={() => setSobre(false)}
      onDrop={e => { e.preventDefault(); setSobre(false); const f = pegarImagem(e.dataTransfer.files); if (f) onArquivo(f); }}
      onPaste={e => { const f = pegarImagem(e.clipboardData.items); if (f) { e.preventDefault(); onArquivo(f); } }}
      aria-label={rotulo}
    >
      {children}
      <label className="zona-texto">
        {ocupado ? 'Enviando…' : rotulo}
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onArquivo(f); e.target.value = ''; }} />
      </label>
    </div>
  );
}

export function BotaoCopiar({ texto, rotulo = 'Copiar prompt' }: { texto: () => string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="fantasma"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto());
          setOk(true);
          setTimeout(() => setOk(false), 1800);
        } catch {
          prompt('Copie o texto abaixo:', texto());
        }
      }}
    >
      {ok ? 'Copiado ✓' : rotulo}
    </button>
  );
}
