import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  getGruposUsuariosParaExportar,
  toTableRow,
  COLUNAS_EXPORTACAO,
  LIMITE_EXPORTACAO,
} from "../../queries";

type SearchParams = { busca?: string };

export default async function ExportarGrupoDeUsuariosPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { busca } = await searchParams;

  const { rows, truncado } = await getGruposUsuariosParaExportar(busca);

  return (
    <TabelaImpressao
      titulo="Grupo de Usuários"
      colunas={COLUNAS_EXPORTACAO}
      linhas={rows.map(toTableRow)}
      truncado={truncado}
      limite={LIMITE_EXPORTACAO}
    />
  );
}
