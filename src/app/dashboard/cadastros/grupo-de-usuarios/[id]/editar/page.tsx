import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { UsersIcon } from "@/components/dashboard/icons";
import { podeAdministrarGruposDeUsuarios } from "@/lib/permissoes";
import { GrupoUsuariosForm } from "../../GrupoUsuariosForm";
import { getCandidatosAMembro, getGrupoUsuarios, getMembros } from "../../queries";

const LISTAGEM = "/dashboard/cadastros/grupo-de-usuarios";

export default async function EditarGrupoDeUsuariosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idNumerico = Number(id);

  // `/grupo-de-usuarios/abc/editar` casa com a rota; sem esta checagem viraria
  // uma consulta com NaN e um erro do Postgres em vez de um 404.
  if (!Number.isInteger(idNumerico)) notFound();

  if (!(await podeAdministrarGruposDeUsuarios())) {
    redirect(LISTAGEM);
  }

  const [grupo, candidatos, membros] = await Promise.all([
    getGrupoUsuarios(idNumerico),
    getCandidatosAMembro(),
    getMembros(idNumerico),
  ]);
  if (!grupo) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Cadastros" }, { label: "Grupo de Usuários" }, { label: grupo.nome }]}
        />
      </div>

      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UsersIcon className="h-4 w-4" />
            Editar Grupo de Usuários
          </h1>
        </div>

        <GrupoUsuariosForm
          id={grupo.id}
          candidatos={candidatos}
          valoresIniciais={{
            nome: grupo.nome,
            descricao: grupo.descricao ?? "",
            membros,
          }}
        />
      </div>
    </div>
  );
}
