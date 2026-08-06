import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import { getGruposSitesParaExportar, toTableRow, LIMITE_EXPORTACAO } from "../../queries";

const TABLE_COLUMNS = ["ID", "Nome", "Status", "Descrição"];

type SearchParams = { busca?: string };

export default async function ExportarGrupoDeSitesPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { busca } = await searchParams;

  const { rows, truncado } = await getGruposSitesParaExportar(busca);

  return (
    <TabelaImpressao
      titulo="Grupo de Sites"
      colunas={TABLE_COLUMNS}
      linhas={rows.map(toTableRow)}
      truncado={truncado}
      limite={LIMITE_EXPORTACAO}
    />
  );
}
