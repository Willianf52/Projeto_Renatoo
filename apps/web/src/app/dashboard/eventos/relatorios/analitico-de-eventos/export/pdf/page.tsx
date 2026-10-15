import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import { extrairFiltros, getAnalitico, paraLinhasDeExportacao, TABLE_COLUMNS, type SearchParams } from "../../queries";

export default async function ExportarAnaliticoDeEventosPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filtros = extrairFiltros(await searchParams);
  const linhas = await getAnalitico(filtros, new Date());

  return (
    <TabelaImpressao
      titulo="Analítico de Eventos"
      colunas={TABLE_COLUMNS}
      linhas={linhas ? paraLinhasDeExportacao(linhas) : []}
      truncado={false}
      limite={0}
    />
  );
}
