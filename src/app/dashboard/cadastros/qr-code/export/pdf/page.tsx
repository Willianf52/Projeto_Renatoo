import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  extrairFiltros,
  getQrCodesParaExportar,
  toTableRow,
  COLUNAS_EXPORTACAO,
  LIMITE_EXPORTACAO,
  type SearchParams,
} from "../../queries";

export default async function ExportarQrCodesPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const { rows, truncado } = await getQrCodesParaExportar(filtros);

  return (
    <TabelaImpressao
      titulo="QR-Code"
      colunas={COLUNAS_EXPORTACAO}
      linhas={rows.map(toTableRow)}
      truncado={truncado}
      limite={LIMITE_EXPORTACAO}
    />
  );
}
