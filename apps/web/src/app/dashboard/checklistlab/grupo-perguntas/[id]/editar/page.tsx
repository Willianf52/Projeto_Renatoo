import { Suspense } from "react";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { ConteudoDoFormulario } from "../../telas-do-formulario";

export default function EditarGrupoPerguntasPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={4} />}>
      <ConteudoDoFormulario params={params} />
    </Suspense>
  );
}
