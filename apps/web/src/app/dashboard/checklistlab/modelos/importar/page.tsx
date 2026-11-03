import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { UploadIcon } from "@/components/dashboard/icons";
import { podeEditarChecklist } from "@/lib/permissoes";
import { ImportarModelosForm } from "./ImportarModelosForm";

/** "Importar Checklists", como o botao de mesmo nome do sistema de referencia. */
export default function ImportarModelosPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={1} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (!(await podeEditarChecklist())) redirect("/dashboard/checklistlab/modelos");

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[
            { label: "ChecklistLab" },
            { label: "Criar Checklist", href: "/dashboard/checklistlab/modelos" },
            { label: "Importar Checklists" },
          ]}
        />
      </div>
      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UploadIcon className="h-4 w-4" />
            Importar Checklists
          </h1>
        </div>
        <ImportarModelosForm />
      </div>
    </div>
  );
}
