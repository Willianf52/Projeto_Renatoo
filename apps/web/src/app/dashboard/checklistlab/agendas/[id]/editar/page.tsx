import { Suspense } from "react";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { ConteudoDoFormulario } from "../../telas-do-formulario";

export default function EditarAgendaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-4xl" campos={6} />}>
      <ConteudoDoFormulario params={params} />
    </Suspense>
  );
}
