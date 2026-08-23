import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { UsersIcon } from "@/components/dashboard/icons";
import { podeAdministrarGruposDeUsuarios } from "@/lib/permissoes";
import { GrupoUsuariosForm } from "../GrupoUsuariosForm";
import { getCandidatosAMembro } from "../queries";

const LISTAGEM = "/dashboard/cadastros/grupo-de-usuarios";

export default async function NovoGrupoDeUsuariosPage() {
  // O RLS ja recusaria o insert, mas seria depois de preencher o formulario
  // inteiro. Quem nao administra nem chega a ver a tela.
  if (!(await podeAdministrarGruposDeUsuarios())) {
    redirect(LISTAGEM);
  }

  const candidatos = await getCandidatosAMembro();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Cadastros" }, { label: "Grupo de Usuários" }, { label: "Novo" }]}
        />
      </div>

      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UsersIcon className="h-4 w-4" />
            Novo Grupo de Usuários
          </h1>
        </div>

        <GrupoUsuariosForm
          valoresIniciais={{ nome: "", descricao: "", membros: [] }}
          candidatos={candidatos}
        />
      </div>
    </div>
  );
}
