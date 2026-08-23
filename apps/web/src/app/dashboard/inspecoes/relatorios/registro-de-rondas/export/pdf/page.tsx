import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import { extrairFiltros, getRegistroDeRondas, paraLinhaDeExportacao, TABLE_COLUMNS, type SearchParams } from "../../queries";

export default async function ExportarRegistroDeRondasPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const { linhas, truncado } = await getRegistroDeRondas(filtros);
  const dados = linhas.map(paraLinhaDeExportacao);
  if (truncado) {
    dados.push([
      "…",
      "Resultado truncado — ajuste os filtros para reduzir o total",
      ...Array(TABLE_COLUMNS.length - 2).fill(""),
    ]);
  }

  return (
    <TabelaImpressao
      titulo="Registro das Rondas por Tempo de Permanência"
      colunas={TABLE_COLUMNS}
      linhas={dados}
      // A mensagem padrao da TabelaImpressao ("N registros -- limitado aos
      // primeiros X") descreveria linhas (Locais), mas o teto aqui e sobre
      // leituras -- o aviso certo ja entrou como linha extra acima.
      truncado={false}
      limite={0}
    />
  );
}
