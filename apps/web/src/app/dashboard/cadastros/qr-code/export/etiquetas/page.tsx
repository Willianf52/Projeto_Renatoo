import { FolhaDeEtiquetas } from "@/components/dashboard/FolhaDeEtiquetas";
import { gerarQrCodeDataUrl } from "@/lib/qrcode";
import {
  extrairFiltros,
  getQrCodesParaExportar,
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

export default async function ExportarEtiquetasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const { rows, truncado } = await getQrCodesParaExportar(filtros);

  const etiquetas = await Promise.all(
    rows.map(async (qrCode) => ({
      codigo: qrCode.codigo,
      qrDataUrl: await gerarQrCodeDataUrl(qrCode.codigo),
      site: qrCode.sites?.nome ?? "",
      finalidade: qrCode.finalidade,
    })),
  );

  return <FolhaDeEtiquetas etiquetas={etiquetas} truncado={truncado} limite={LIMITE_EXPORTACAO} />;
}
