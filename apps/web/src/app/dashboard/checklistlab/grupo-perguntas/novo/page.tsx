import { Suspense } from "react";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { ConteudoDoFormulario } from "../telas-do-formulario";

export default function NovoGrupoPerguntasPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={4} />}>
      <ConteudoDoFormulario />
    </Suspense>
  );
}
