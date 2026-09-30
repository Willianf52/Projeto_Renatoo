import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { ClipboardListIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { ModeloForm } from "../../ModeloForm";
import { getModelo, getOpcoesDeGrupos } from "../../queries";

/**
 * Pagina sem `async`: com Cache Components, o `await` no corpo travava a
 * navegacao ate tudo voltar -- ver `site-planta/novo/page.tsx`.
 */
export default function EditarModeloPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={3} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNumerico = idNaUrl(id);

  // `/modelos/abc/editar` casa com a rota; sem isto viraria consulta com NaN.
  if (idNumerico === null) notFound();

  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/checklistlab/modelos");
  }

  const [modelo, grupos] = await Promise.all([getModelo(idNumerico), getOpcoesDeGrupos()]);
  if (!modelo) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "ChecklistLab" }, { label: "Modelos de Checklist" }, { label: modelo.nome }]}
        />
      </div>

      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Editar Modelo de Checklist
          </h1>
        </div>

        <ModeloForm
          id={modelo.id}
          padrao={modelo.padrao}
          valoresIniciais={{ nome: modelo.nome, ativo: modelo.ativo, grupos: modelo.grupos }}
          grupos={grupos}
        />
      </div>
    </div>
  );
}
