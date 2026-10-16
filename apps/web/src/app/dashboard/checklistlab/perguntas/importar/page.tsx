import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { UploadIcon } from "@/components/dashboard/icons";
import { podeEditarChecklist } from "@/lib/permissoes";
import { getModelo } from "../../modelos/queries";
import { modeloDoFiltro } from "../queries";
import { ImportarPerguntasForm } from "./ImportarPerguntasForm";

type SearchParams = Record<string, string | string[] | undefined>;

/** Importar e por checklist: a lista filtrada leva o `?modelo=`. */
export default function ImportarPerguntasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={1} />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (!(await podeEditarChecklist())) redirect("/dashboard/checklistlab/perguntas");

  const params = await searchParams;
  const id = modeloDoFiltro(Array.isArray(params.modelo) ? params.modelo[0] : params.modelo);
  if (id === null) notFound();
  const modelo = await getModelo(id);
  if (!modelo) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: modelo.nome }, { label: "Importar perguntas" }]} />
      </div>
      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UploadIcon className="h-4 w-4" />
            Importar perguntas em {modelo.nome}
          </h1>
        </div>
        <ImportarPerguntasForm modeloId={modelo.id} />
      </div>
    </div>
  );
}
