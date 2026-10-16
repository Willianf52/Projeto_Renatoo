import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  analiticoPorChecklist,
  COLUNAS_DO_ANALITICO,
  extrairFiltros,
  getChecklists,
  linhasDoAnalitico,
  type SearchParams,
} from "../../../dados";

/** Abre em aba nova so para imprimir: fatiar em Suspense nao ganha nada. */
export const instant = false;

export default async function ExportarAnaliticoPorChecklistPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filtros = extrairFiltros(await searchParams, new Date());
  const linhas = linhasDoAnalitico(analiticoPorChecklist(await getChecklists(filtros)));

  return (
    <TabelaImpressao
      titulo="Analítico por Checklist"
      colunas={COLUNAS_DO_ANALITICO}
      linhas={linhas}
      truncado={false}
      limite={0}
    />
  );
}
