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

/**
 * Pagina de impressao: o botao da listagem a abre em aba nova (`target="_blank"`)
 * e `ImprimirAoAbrir` dispara o dialogo de impressao assim que ela monta. Nao
 * existe navegacao client-side ate aqui para ser instantanea, entao esperar a
 * consulta antes de renderizar e o comportamento certo -- um `<Suspense>` so
 * mostraria um esqueleto piscando antes do dialogo. `false` declara isso ao
 * Cache Components em vez de deixar o aviso de rota bloqueante no overlay.
 */
export const instant = false;

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
