import type { Metadata } from "next";
import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  COLUNAS_DO_PDF,
  TETO_DO_HISTORICO,
  extrairFiltros,
  getHistorico,
  toLinhaDoPdf,
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

/** O titulo da aba vira o nome sugerido do arquivo ao salvar como PDF. */
export const metadata: Metadata = { title: "historico_checklist" };

/** No formato do PDF do antigo (30/10/2026): as 13 colunas de la, folha
 * deitada, linhas brancas e texto a esquerda. */
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
      colunas={COLUNAS_DO_PDF}
      linhas={historico.linhas.map(toLinhaDoPdf)}
      truncado={historico.truncado}
      limite={TETO_DO_HISTORICO}
      estilo="simples"
      paisagem
    />
  );
}
