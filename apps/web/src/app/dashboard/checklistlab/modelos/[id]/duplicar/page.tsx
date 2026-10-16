import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { CopyIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { podeEditarChecklist } from "@/lib/permissoes";
import { getModelo } from "../../queries";
import { DuplicarModeloForm } from "./DuplicarModeloForm";

export default function DuplicarModeloPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={1} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const id = idNaUrl((await params).id);
  if (id === null) notFound();
  if (!(await podeEditarChecklist())) redirect("/dashboard/checklistlab/modelos");

  const modelo = await getModelo(id);
  if (!modelo) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Criar Checklist" }, { label: `Duplicar ${modelo.nome}` }]} />
      </div>
      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <CopyIcon className="h-4 w-4" />
            Duplicar {modelo.nome}
          </h1>
        </div>
        <DuplicarModeloForm origem={modelo.id} nomeSugerido={`${modelo.nome} (cópia)`} />
      </div>
    </div>
  );
}
