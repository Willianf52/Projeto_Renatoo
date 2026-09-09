import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  TABLE_COLUMNS,
  TETO_DO_HISTORICO,
  extrairFiltros,
  getHistorico,
  toTableRow,
  type SearchParams,
} from "../../queries";

export default async function ExportarHistoricoDeChecklistPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filtros = extrairFiltros(await searchParams);
  const historico = await getHistorico(filtros);

  return (
    <TabelaImpressao
      titulo="Histórico de Checklist"
      colunas={TABLE_COLUMNS}
      linhas={historico.linhas.map(toTableRow)}
      truncado={historico.truncado}
      limite={TETO_DO_HISTORICO}
    />
  );
}
