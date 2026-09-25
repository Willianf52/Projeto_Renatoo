import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { UsersIcon } from "@/components/dashboard/icons";
import { podeAdministrarGruposDeUsuarios } from "@/lib/permissoes";
import { GrupoUsuariosForm } from "../../GrupoUsuariosForm";
import { getCandidatosAMembro, getGrupoUsuarios, getMembros } from "../../queries";
import { idNaUrl } from "@/lib/id-na-url";

const LISTAGEM = "/dashboard/cadastros/grupo-de-usuarios";

/**
 * Pagina sem `async`: com Cache Components, o `await` no corpo (permissao e
 * consultas recortadas por RLS) travava a navegacao ate tudo voltar -- ver
 * `site-planta/novo/page.tsx`.
 */
export default function EditarGrupoDeUsuariosPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={3} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNumerico = idNaUrl(id);

  // `/grupo-de-usuarios/abc/editar` casa com a rota; sem esta checagem viraria
  // uma consulta com NaN e um erro do Postgres em vez de um 404.
  if (idNumerico === null) notFound();

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
