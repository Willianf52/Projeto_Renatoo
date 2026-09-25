import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { UploadIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { ImportarGruposForm } from "./ImportarGruposForm";

/** Mesmo arranjo de `novo/page.tsx`: o `await` da permissao fica dentro do Suspense. */
export default function ImportarGruposDeSitesPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={1} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/cadastros/grupo-de-sites");
  }

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Grupo de Sites" }, { label: "Importar" }]} />
      </div>

      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UploadIcon className="h-4 w-4" />
            Importar Grupos de Sites
          </h1>
        </div>

        <ImportarGruposForm />
      </div>
    </div>
  );
}
