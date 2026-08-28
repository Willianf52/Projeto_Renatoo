import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { ClipboardListIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { PerguntaForm } from "../../PerguntaForm";
import { getPergunta } from "../../queries";

export default async function EditarPerguntaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idNumerico = Number(id);

  // `/perguntas/abc/editar` casa com a rota; sem esta checagem viraria uma
  // consulta com NaN e um erro do Postgres em vez de um 404.
  if (!Number.isInteger(idNumerico)) notFound();

  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/checklistlab/perguntas");
  }

  const pergunta = await getPergunta(idNumerico);
  if (!pergunta) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[
            { label: "ChecklistLab" },
            { label: "Perguntas do Checklist" },
            { label: `Pergunta ${pergunta.ordem}` },
          ]}
        />
      </div>

      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Editar Pergunta do Checklist
          </h1>
        </div>

        <PerguntaForm
          id={pergunta.id}
          valoresIniciais={{
            texto: pergunta.texto,
            ordem: String(pergunta.ordem),
            ativo: pergunta.ativo,
          }}
        />
      </div>
    </div>
  );
}
