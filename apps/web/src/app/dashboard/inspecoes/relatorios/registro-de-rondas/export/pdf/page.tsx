import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import { extrairFiltros, getRegistroDeRondas, paraLinhaDeExportacao, TABLE_COLUMNS, type SearchParams } from "../../queries";

export default async function ExportarRegistroDeRondasPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  // Sem aviso de truncado desde a 0049: o mes e agregado inteiro no banco.
  // Sem Mês/Ano escolhido, sai so o cabecalho -- a tela tambem nao consulta.
  const dados = ((await getRegistroDeRondas(filtros)) ?? []).map(paraLinhaDeExportacao);

  return (
    <TabelaImpressao
      titulo="Registro das Rondas por Tempo de Permanência"
      colunas={TABLE_COLUMNS}
      linhas={dados}
      truncado={false}
      limite={0}
    />
  );
}
