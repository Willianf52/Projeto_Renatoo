import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import { COLUNAS, extrairFiltros, getEventos, paraLinhaDeExportacao, type SearchParams } from "../../queries";

/** Abre em aba nova so para imprimir: fatiar em Suspense nao ganha nada. */
export const instant = false;

export default async function ExportarEventosPdfPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const eventos = await getEventos(extrairFiltros(await searchParams));

  return (
    <TabelaImpressao
      titulo="Cadastro de Eventos"
      colunas={COLUNAS}
      linhas={eventos.map(paraLinhaDeExportacao)}
      truncado={false}
      limite={0}
    />
  );
}
