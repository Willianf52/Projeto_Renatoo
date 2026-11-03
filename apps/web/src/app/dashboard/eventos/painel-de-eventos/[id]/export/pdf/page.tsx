import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImprimirAoAbrir } from "@/components/dashboard/ImprimirAoAbrir";
import { OcorrenciaImpressa } from "../../../OcorrenciaImpressa";
import { getOcorrencia, idValido } from "../../../queries";

/** Pagina de impressao aberta em aba nova (ver o PDF Unificado ao lado). */
export const instant = false;

export const metadata: Metadata = { title: "registro_de_evento" };

/**
 * "Exportar para PDF" do detalhe do evento. `notFound()` responde igual para
 * "nao existe" e "o RLS nao deixa ver", como o detalhe.
 */
export default async function PdfDoEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNumerico = idValido(id);
  if (idNumerico === null) notFound();

  const ocorrencia = await getOcorrencia(idNumerico);
  if (!ocorrencia) notFound();

  return (
    <div data-paleta="original" className="bg-white p-6 text-black">
      <ImprimirAoAbrir esperarImagens />
      <OcorrenciaImpressa ocorrencia={ocorrencia} />
    </div>
  );
}
