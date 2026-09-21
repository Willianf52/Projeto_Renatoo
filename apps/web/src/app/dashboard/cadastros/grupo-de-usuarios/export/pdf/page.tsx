import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  getGruposUsuariosParaExportar,
  toTableRow,
  COLUNAS_EXPORTACAO,
  LIMITE_EXPORTACAO,
} from "../../queries";

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

export default async function ExportarGrupoDeUsuariosPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { busca } = await searchParams;

  const { rows, truncado } = await getGruposUsuariosParaExportar(busca);

  return (
    <TabelaImpressao
      titulo="Grupo de Usuários"
      colunas={COLUNAS_EXPORTACAO}
      linhas={rows.map(toTableRow)}
      truncado={truncado}
      limite={LIMITE_EXPORTACAO}
    />
  );
}
