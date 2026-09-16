import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  TABLE_COLUMNS,
  TETO_DO_HISTORICO,
  extrairFiltros,
  getHistorico,
  toTableRow,
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

export default async function ExportarHistoricoDeChecklistPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filtros = extrairFiltros(await searchParams);
  const historico = await getHistorico(filtros);

  return (
    <TabelaImpressao
      titulo="Histórico de Checklist"
      colunas={TABLE_COLUMNS}
      linhas={historico.linhas.map(toTableRow)}
      truncado={historico.truncado}
      limite={TETO_DO_HISTORICO}
    />
  );
}
