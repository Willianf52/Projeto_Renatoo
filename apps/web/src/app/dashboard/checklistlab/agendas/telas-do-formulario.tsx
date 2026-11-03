import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { ClipboardListIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { podeEditarChecklist } from "@/lib/permissoes";
import { AgendaForm } from "./AgendaForm";
import { buscarAgenda, getOpcoesDaAgenda } from "./queries";
import { LISTAGEM } from "./regras";

/** Corpo de Nova e de Editar Agenda, dentro do `<Suspense>` de cada pagina. */
export async function ConteudoDoFormulario({ params }: { params?: Promise<{ id: string }> }) {
  let id: number | null = null;
  if (params) {
    id = idNaUrl((await params).id);
    if (id === null) notFound();
  }
  // O RLS recusaria a gravacao, mas so depois de preencher o formulario.
  if (!(await podeEditarChecklist())) redirect(LISTAGEM);

  const [agenda, opcoes] = await Promise.all([id === null ? null : buscarAgenda(id), getOpcoesDaAgenda()]);
  if (id !== null && !agenda) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "ChecklistLab" }, { label: "Criar Agenda", href: LISTAGEM }, { label: agenda?.nome ?? "Nova" }]}
        />
      </div>
      <div
        className="max-w-4xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            {agenda ? "Editar Agenda" : "Nova Agenda"}
          </h1>
        </div>
        <AgendaForm
          id={agenda?.id}
          opcoes={opcoes}
          valoresIniciais={{
            nome: agenda?.nome ?? "",
            modeloId: agenda ? String(agenda.modeloId) : "",
            responsavelId: agenda?.responsavelId ?? "",
            grupoUsuarioId: agenda?.grupoUsuarioId ? String(agenda.grupoUsuarioId) : "",
            dataInicial: agenda?.dataInicial ?? "",
            dataFinal: agenda?.dataFinal ?? "",
            recorrencia: agenda?.recorrencia ?? "MENSAL",
            toleranciaDias: agenda ? String(agenda.toleranciaDias) : "0",
            ativo: agenda?.ativo ?? true,
            sites: (agenda?.sites ?? []).map((s) => String(s.id)),
          }}
        />
      </div>
    </div>
  );
}
