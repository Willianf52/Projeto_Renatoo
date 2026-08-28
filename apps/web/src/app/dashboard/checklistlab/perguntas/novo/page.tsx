import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { ClipboardListIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { PerguntaForm } from "../PerguntaForm";
import { getProximaOrdem } from "../queries";

export default async function NovaPerguntaPage() {
  // O RLS (policy da 0043) ja recusaria o insert, mas seria depois de
  // preencher o formulario inteiro. Quem nao administra nem chega a ver a tela.
  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/checklistlab/perguntas");
  }

  const proximaOrdem = await getProximaOrdem();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[
            { label: "ChecklistLab" },
            { label: "Perguntas do Checklist" },
            { label: "Nova" },
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
            Nova Pergunta do Checklist
          </h1>
        </div>

        <PerguntaForm
          valoresIniciais={{ texto: "", ordem: String(proximaOrdem), ativo: true }}
        />
      </div>
    </div>
  );
}
