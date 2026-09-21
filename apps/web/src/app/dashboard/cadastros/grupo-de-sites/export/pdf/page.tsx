import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import { getGruposSitesParaExportar, toTableRow, LIMITE_EXPORTACAO } from "../../queries";

const TABLE_COLUMNS = ["ID", "Nome", "Status", "Descrição"];

type SearchParams = { busca?: string };

/**
 * Pagina de impressao: o botao da listagem a abre em aba nova (`target="_blank"`)
 * e `ImprimirAoAbrir` dispara o dialogo de impressao assim que ela monta. Nao
 * existe navegacao client-side ate aqui para ser instantanea, entao esperar a
 * consulta antes de renderizar e o comportamento certo -- um `<Suspense>` so
 * mostraria um esqueleto piscando antes do dialogo. `false` declara isso ao
 * Cache Components em vez de deixar o aviso de rota bloqueante no overlay.
 */
export const instant = false;

export default async function ExportarGrupoDeSitesPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { busca } = await searchParams;

  const { rows, truncado } = await getGruposSitesParaExportar(busca);

  return (
    <TabelaImpressao
      titulo="Grupo de Sites"
      colunas={TABLE_COLUMNS}
      linhas={rows.map(toTableRow)}
      truncado={truncado}
      limite={LIMITE_EXPORTACAO}
    />
  );
}
