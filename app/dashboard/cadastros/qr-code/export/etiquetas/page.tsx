import { FolhaDeEtiquetas } from "@/components/dashboard/FolhaDeEtiquetas";
import { gerarQrCodeDataUrl } from "@/lib/qrcode";
import {
  extrairFiltros,
  getQrCodesParaExportar,
  LIMITE_EXPORTACAO,
  type SearchParams,
} from "../../queries";

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
