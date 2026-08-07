import { ImprimirAoAbrir } from "./ImprimirAoAbrir";

export type Etiqueta = {
  codigo: string;
  qrDataUrl: string;
  site: string;
  finalidade: string | null;
};

/**
 * Folha de etiquetas para o botão "Imprimir Etiquetas" do cadastro de
 * QR-Code -- mesmo mecanismo do `TabelaImpressao` (fundo branco, sem a
 * navegação do dashboard, `ImprimirAoAbrir` dispara o diálogo de impressão),
 * mas em grade de cartões em vez de tabela: cada QR precisa de espaço
 * próprio para ser lido, uma linha de tabela não serve de etiqueta.
 */
export function FolhaDeEtiquetas({
  etiquetas,
  truncado,
  limite,
}: {
  etiquetas: Etiqueta[];
  truncado: boolean;
  limite: number;
}) {
  return (
    <div className="bg-white p-6 text-black">
      <ImprimirAoAbrir />

      <h1 className="mb-1 text-lg font-semibold">Etiquetas de QR-Code</h1>
      <p className="mb-4 text-xs text-slate-600">
        {etiquetas.length} {etiquetas.length === 1 ? "etiqueta" : "etiquetas"}
        {truncado && ` — limitado às primeiras ${limite}, ajuste os filtros para reduzir o total`}
      </p>

      <div className="grid grid-cols-3 gap-4">
        {etiquetas.map((etiqueta) => (
          // codigo e unique (migration 0003): serve de key sem precisar do id.
          <div
            key={etiqueta.codigo}
            className="flex flex-col items-center gap-1 break-inside-avoid rounded border border-slate-300 p-3 text-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada no servidor, next/image não ajuda aqui */}
            <img src={etiqueta.qrDataUrl} alt={`QR-Code ${etiqueta.codigo}`} className="h-28 w-28" />
            <p className="text-sm font-semibold">{etiqueta.codigo}</p>
            <p className="text-xs text-slate-600">{etiqueta.site}</p>
            {etiqueta.finalidade && <p className="text-xs text-slate-500">{etiqueta.finalidade}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
