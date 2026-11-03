import { LOGO_PARA_PAPEL_PNG_BASE64 } from "@/lib/logo-para-papel";
import { ImprimirAoAbrir } from "./ImprimirAoAbrir";

export type Etiqueta = {
  codigo: string;
  qrDataUrl: string;
  site: string;
  finalidade: string | null;
};

/**
 * Os formatos da caixa "Gerar PDF" do QR-Code no sistema de referencia: A3,
 * A4, A4 com um QR por folha e A5. Cada um define o papel (`@page size`), as
 * colunas da grade e o tamanho do QR.
 */
export const FORMATOS_DE_ETIQUETA = [
  { value: "A4", label: "A4" },
  { value: "A4_1", label: "A4 (1 QR por folha)" },
  { value: "A3", label: "A3" },
  { value: "A5", label: "A5" },
] as const;

export type FormatoDeEtiqueta = (typeof FORMATOS_DE_ETIQUETA)[number]["value"];

export function formatoDeEtiqueta(valor: string | undefined): FormatoDeEtiqueta {
  return FORMATOS_DE_ETIQUETA.some((f) => f.value === valor) ? (valor as FormatoDeEtiqueta) : "A4";
}

const LAYOUT: Record<FormatoDeEtiqueta, { papel: string; grade: string; qr: string; codigo: string; porFolha: boolean }> = {
  A4: { papel: "A4", grade: "grid grid-cols-3 gap-4", qr: "h-28 w-28", codigo: "text-sm", porFolha: false },
  A3: { papel: "A3", grade: "grid grid-cols-4 gap-5", qr: "h-36 w-36", codigo: "text-base", porFolha: false },
  A5: { papel: "A5", grade: "grid grid-cols-2 gap-3", qr: "h-24 w-24", codigo: "text-xs", porFolha: false },
  A4_1: { papel: "A4", grade: "flex flex-col", qr: "h-[120mm] w-[120mm]", codigo: "text-3xl", porFolha: true },
};

/**
 * Folha de etiquetas para o botão "Imprimir Etiquetas" do cadastro de
 * QR-Code -- mesmo mecanismo do `TabelaImpressao` (fundo branco, sem a
 * navegação do dashboard, `ImprimirAoAbrir` dispara o diálogo de impressão),
 * mas em grade de cartões em vez de tabela: cada QR precisa de espaço
 * próprio para ser lido, uma linha de tabela não serve de etiqueta.
 *
 * `formato` e `comLogo` vêm da tela de opções (`export/opcoes-de-etiqueta`),
 * como a caixa do sistema de referencia.
 */
export function FolhaDeEtiquetas({
  etiquetas,
  truncado,
  limite,
  formato = "A4",
  comLogo = false,
}: {
  etiquetas: Etiqueta[];
  truncado: boolean;
  limite: number;
  formato?: FormatoDeEtiqueta;
  comLogo?: boolean;
}) {
  const layout = LAYOUT[formato];

  return (
    <div data-paleta="original" className="bg-white p-6 text-black">
      <ImprimirAoAbrir />
      {/* O papel do dialogo de impressao: sem isto o navegador usa o padrao
          da impressora e o A3/A5 escolhido nao chega ao PDF. */}
      <style>{`@page { size: ${layout.papel}; margin: 10mm; }`}</style>

      <div className="print:hidden">
        <h1 className="mb-1 text-lg font-semibold">Etiquetas de QR-Code</h1>
        <p className="mb-4 text-xs text-slate-600">
          {etiquetas.length} {etiquetas.length === 1 ? "etiqueta" : "etiquetas"}, formato{" "}
          {FORMATOS_DE_ETIQUETA.find((f) => f.value === formato)?.label}
          {truncado && `, limitado às primeiras ${limite}. Ajuste os filtros para reduzir o total`}
        </p>
      </div>

      <div className={layout.grade}>
        {etiquetas.map((etiqueta, indice) => (
          // codigo e unique (migration 0003): serve de key sem precisar do id.
          <div
            key={etiqueta.codigo}
            className={`flex flex-col items-center gap-1 break-inside-avoid rounded border border-slate-300 p-3 text-center ${
              layout.porFolha
                ? `min-h-[250mm] justify-center ${indice < etiquetas.length - 1 ? "break-after-page" : ""}`
                : ""
            }`}
          >
            {comLogo && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL embutida, next/image não ajuda aqui
              <img
                src={`data:image/png;base64,${LOGO_PARA_PAPEL_PNG_BASE64}`}
                alt="Up Serviços"
                className={layout.porFolha ? "mb-4 h-24" : "h-8"}
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada no servidor, next/image não ajuda aqui */}
            <img src={etiqueta.qrDataUrl} alt={`QR-Code ${etiqueta.codigo}`} className={layout.qr} />
            <p className={`${layout.codigo} font-semibold`}>{etiqueta.codigo}</p>
            <p className={layout.porFolha ? "text-xl text-slate-700" : "text-xs text-slate-600"}>{etiqueta.site}</p>
            {etiqueta.finalidade && (
              <p className={layout.porFolha ? "text-lg text-slate-500" : "text-xs text-slate-500"}>{etiqueta.finalidade}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
