import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  COLUNAS_DO_PDF,
  getColetasParaExportar,
  toLinhaDoPdf,
  extrairFiltros,
  LIMITE_EXPORTACAO,
  type SearchParams,
} from "../../queries";

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
      titulo="Relatório Coletor de Dados"
      periodo={{ inicio: filtros.dataInicial, fim: filtros.dataFinal }}
      colunas={COLUNAS_DO_PDF}
      // A consulta vem da mais nova para a mais antiga (a da tela); o PDF do
      // antigo lista em ordem de horario, da primeira coleta do dia em diante.
      linhas={[...rows].reverse().map(toLinhaDoPdf)}
      truncado={truncado}
      limite={LIMITE_EXPORTACAO}
    />
  );
}
