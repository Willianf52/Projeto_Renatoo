import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { GridIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { podeEditarChecklist } from "@/lib/permissoes";
import { GrupoPerguntasForm } from "./GrupoPerguntasForm";
import { buscarGrupo, proximaOrdem } from "./queries";
import { COR_PADRAO, LISTAGEM } from "./regras";

/** Corpo de Novo e de Editar, dentro do `<Suspense>` de cada pagina. */
export async function ConteudoDoFormulario({ params }: { params?: Promise<{ id: string }> }) {
  let id: number | null = null;
  if (params) {
    id = idNaUrl((await params).id);
    if (id === null) notFound();
  }
  // O RLS recusaria a gravacao, mas so depois de preencher o formulario.
  if (!(await podeEditarChecklist())) redirect(LISTAGEM);

  const grupo = id === null ? null : await buscarGrupo(id);
  if (id !== null && !grupo) notFound();
  const ordem = grupo ? grupo.ordem : await proximaOrdem();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Grupo Perguntas" }, { label: grupo?.nome ?? "Novo" }]} />
      </div>
      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <GridIcon className="h-4 w-4" />
            {grupo ? "Editar Grupo" : "Novo Grupo"}
          </h1>
        </div>
        <GrupoPerguntasForm
          id={grupo?.id}
          valoresIniciais={{
            nome: grupo?.nome ?? "",
            cor: grupo?.cor ?? COR_PADRAO,
            ordem: String(ordem),
            ativo: grupo?.ativo ?? true,
          }}
        />
      </div>
    </div>
  );
}
