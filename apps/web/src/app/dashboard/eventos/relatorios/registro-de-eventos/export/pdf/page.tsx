import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  extrairFiltros,
  getRegistroDeEventos,
  linhaDeTotal,
  paraLinhasDeExportacao,
  TABLE_COLUMNS,
  type SearchParams,
} from "../../queries";

export default async function ExportarRegistroDeEventosPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filtros = extrairFiltros(await searchParams);

  // Sem periodo nao ha o que imprimir -- a tela pede Data Inicial e Final
  // antes de consultar, e o link de exportar carrega os mesmos filtros.
  const registro = await getRegistroDeEventos(filtros);
  const dados = registro ? paraLinhasDeExportacao(registro) : [];

  return (
    <TabelaImpressao
      titulo="Registro de Eventos"
      colunas={TABLE_COLUMNS}
      linhas={dados}
      rodape={registro ? linhaDeTotal(registro) : undefined}
      truncado={false}
      limite={0}
    />
  );
}
