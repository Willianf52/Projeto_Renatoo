import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  getColetasParaExportar,
  toTableRow,
  extrairFiltros,
  LIMITE_EXPORTACAO,
  type SearchParams,
} from "../../queries";

const TABLE_COLUMNS = [
  "Coleta",
  "Data / Hora",
  "Coletor de Dados",
  "Funcionário",
  "Local",
  "Área",
  "Evento",
  "Observação",
  "Ação",
  "Qualificador",
  "Data Integração",
];

export default async function ExportarColetasImportadasPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const { rows, truncado } = await getColetasParaExportar(filtros);

  return (
    <TabelaImpressao
      titulo="Coletas Importadas"
      colunas={TABLE_COLUMNS}
      linhas={rows.map(toTableRow)}
      truncado={truncado}
      limite={LIMITE_EXPORTACAO}
    />
  );
}
