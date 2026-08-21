import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import { extrairFiltros, getHorasPorUsuario, paraLinhaDeExportacao, TABLE_COLUMNS, type SearchParams } from "../../queries";

export default async function ExportarHorasPorUsuarioPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const resultado = await getHorasPorUsuario(filtros);
  const dados = (resultado?.linhas ?? []).map(paraLinhaDeExportacao);

  if (resultado?.truncado) {
    dados.push(["…", "Resultado truncado — reduza o período para ver as horas corretas", ...Array(TABLE_COLUMNS.length - 2).fill("")]);
  }

  return <TabelaImpressao titulo="Quantidade de Horas por Usuário" colunas={TABLE_COLUMNS} linhas={dados} truncado={false} limite={0} />;
}
