import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { ClipboardListIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { ModeloForm } from "../ModeloForm";
import { getOpcoesDeGrupos } from "../queries";

/**
 * Pagina sem `async`: com Cache Components, o `await` no corpo travava a
 * navegacao ate tudo voltar -- ver `site-planta/novo/page.tsx`.
 */
export default function NovoModeloPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={3} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  // A policy da 0061 ja recusaria o insert, mas depois de preencher tudo.
  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/checklistlab/modelos");
  }

  const grupos = await getOpcoesDeGrupos();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "ChecklistLab" }, { label: "Modelos de Checklist" }, { label: "Novo" }]}
        />
      </div>

      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Novo Modelo de Checklist
          </h1>
        </div>

        <ModeloForm valoresIniciais={{ nome: "", ativo: true, grupos: [] }} grupos={grupos} />
      </div>
    </div>
  );
}
