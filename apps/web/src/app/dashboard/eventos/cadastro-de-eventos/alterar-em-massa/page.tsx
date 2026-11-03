import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { MegaphoneIcon } from "@/components/dashboard/icons";
import { podeConfigurarEventos } from "@/lib/permissoes";
import { getDadosDoFormulario, getEventos } from "../queries";
import { LISTAGEM } from "../regras";
import { FormularioDeAlteracao } from "./FormularioDeAlteracao";

/** "Alterar Eventos" (0083), o botao de permissoes em massa do antigo. */
export default function AlterarEventosEmMassaPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-3xl" campos={4} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (!(await podeConfigurarEventos())) redirect(LISTAGEM);

  const [eventos, dados] = await Promise.all([getEventos({ situacao: "todos" }), getDadosDoFormulario(null)]);

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Eventos" }, { label: "Cadastro de Eventos", href: LISTAGEM }, { label: "Alterar Eventos" }]}
        />
      </div>
      <div
        className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <MegaphoneIcon className="h-4 w-4" />
            Alterações de permissões em massa
          </h1>
        </div>
        <FormularioDeAlteracao
          eventos={eventos.map((e) => ({ value: String(e.id), label: e.nome }))}
          sites={dados?.sites ?? []}
          grupos={dados?.gruposDeUsuarios ?? []}
        />
      </div>
    </div>
  );
}
