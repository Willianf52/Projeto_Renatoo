import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { UploadIcon } from "@/components/dashboard/icons";
import { podeConfigurarEventos } from "@/lib/permissoes";
import { LISTAGEM } from "../regras";
import { ImportarEventosForm } from "./ImportarEventosForm";

/** Mesmo arranjo do Importar Grupos de Sites: a permissao dentro do Suspense. */
export default function ImportarEventosPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={1} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (!(await podeConfigurarEventos())) redirect(LISTAGEM);

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Cadastro de Eventos" }, { label: "Importar" }]} />
      </div>
      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UploadIcon className="h-4 w-4" />
            Importar Eventos
          </h1>
        </div>
        <ImportarEventosForm />
      </div>
    </div>
  );
}
