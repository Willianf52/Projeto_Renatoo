import { FolhaDeEtiquetas, formatoDeEtiqueta } from "@/components/dashboard/FolhaDeEtiquetas";
import { gerarQrCodeDataUrl } from "@/lib/qrcode";
import {
  extrairFiltros,
  getQrCodesParaExportar,
  LIMITE_EXPORTACAO,
  primeiro,
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
  // Formato e logo escolhidos em `../opcoes-de-etiqueta`; sem eles, A4 sem
  // logo, como era antes da tela de opcoes.
  const formato = formatoDeEtiqueta(primeiro(params.formato));
  const comLogo = primeiro(params.logo) === "1";
  // QR maior no papel pede mais pixels, senao a impressao sai borrada.
  const largura = formato === "A4_1" ? 900 : formato === "A3" ? 400 : 240;

  const etiquetas = await Promise.all(
    rows.map(async (qrCode) => ({
      codigo: qrCode.codigo,
      qrDataUrl: await gerarQrCodeDataUrl(qrCode.codigo, largura),
      site: qrCode.sites?.nome ?? "",
      finalidade: qrCode.finalidade,
    })),
  );

  return (
    <FolhaDeEtiquetas
      etiquetas={etiquetas}
      truncado={truncado}
      limite={LIMITE_EXPORTACAO}
      formato={formato}
      comLogo={comLogo}
    />
  );
}
