import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import { extrairFiltros, getInspecoesComInicioEFim, paraLinhaDeExportacao, TABLE_COLUMNS, type SearchParams } from "../../queries";

export default async function ExportarInspecoesInicioFimVisitaPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const resultado = await getInspecoesComInicioEFim(filtros);
  const dados = (resultado?.linhas ?? []).map(paraLinhaDeExportacao);
  if (resultado?.truncado) {
    dados.push(["…", "Resultado truncado — ajuste o período para reduzir o total", ...Array(TABLE_COLUMNS.length - 2).fill("")]);
  }

  return (
    <TabelaImpressao
      titulo="Relatório de Inspeções com Início e Fim de Visita"
      colunas={TABLE_COLUMNS}
      linhas={dados}
      truncado={false}
      limite={0}
    />
  );
}
