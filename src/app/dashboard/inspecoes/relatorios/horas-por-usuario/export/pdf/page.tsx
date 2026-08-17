import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import { extrairFiltros, getHorasPorUsuario, paraLinhaDeExportacao, TABLE_COLUMNS, type SearchParams } from "../../queries";

export default async function ExportarHorasPorUsuarioPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const linhas = await getHorasPorUsuario(filtros);
  const dados = (linhas ?? []).map(paraLinhaDeExportacao);

  return <TabelaImpressao titulo="Quantidade de Horas por Usuário" colunas={TABLE_COLUMNS} linhas={dados} truncado={false} limite={0} />;
}
