import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  extrairFiltros,
  getSitesParaExportar,
  toTableRow,
  COLUNAS_EXPORTACAO,
  LIMITE_EXPORTACAO,
  type SearchParams,
} from "../../queries";

export default async function ExportarSitePlantaPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const { rows, truncado } = await getSitesParaExportar(filtros);

  return (
    <TabelaImpressao
      titulo="Site / Planta"
      colunas={COLUNAS_EXPORTACAO}
      linhas={rows.map(toTableRow)}
      truncado={truncado}
      limite={LIMITE_EXPORTACAO}
    />
  );
}
