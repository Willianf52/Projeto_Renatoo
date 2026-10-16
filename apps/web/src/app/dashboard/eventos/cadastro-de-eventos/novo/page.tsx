import { Suspense } from "react";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { ConteudoDoFormulario } from "../telas-do-formulario";

export default function NovoEventoPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-4xl" campos={7} />}>
      <ConteudoDoFormulario />
    </Suspense>
  );
}
