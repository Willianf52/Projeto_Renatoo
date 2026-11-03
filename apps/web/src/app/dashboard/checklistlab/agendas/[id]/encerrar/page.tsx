import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { ClipboardListIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { podeEditarChecklist } from "@/lib/permissoes";
import { buscarAgenda } from "../../queries";
import { LISTAGEM } from "../../regras";
import { FormularioDeEncerramento } from "./FormularioDeEncerramento";

export default function EncerrarAgendaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={1} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const id = idNaUrl((await params).id);
  if (id === null) notFound();
  if (!(await podeEditarChecklist())) redirect(LISTAGEM);
  const agenda = await buscarAgenda(id);
  if (!agenda) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "ChecklistLab" }, { label: "Criar Agenda", href: LISTAGEM }, { label: agenda.nome }]}
        />
      </div>
      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Exclusão de Agendamentos: {agenda.nome}
          </h1>
        </div>
        <FormularioDeEncerramento id={agenda.id} />
      </div>
    </div>
  );
}
