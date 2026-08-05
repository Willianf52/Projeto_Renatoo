import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { SitemapIcon } from "@/components/dashboard/icons";
import { GrupoSiteForm } from "../../GrupoSiteForm";
import { getGrupoSite, podeAdministrarCadastros } from "../../queries";

export default async function EditarGrupoDeSitesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idNumerico = Number(id);

  // `/grupo-de-sites/abc/editar` casa com a rota; sem esta checagem viraria uma
  // consulta com NaN e um erro do Postgres em vez de um 404.
  if (!Number.isInteger(idNumerico)) notFound();

  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/cadastros/grupo-de-sites");
  }

  const grupo = await getGrupoSite(idNumerico);
  if (!grupo) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Cadastros" }, { label: "Grupo de Sites" }, { label: grupo.nome }]}
        />
      </div>

      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <SitemapIcon className="h-4 w-4" />
            Editar Grupo de Sites
          </h1>
        </div>

        <GrupoSiteForm
          id={grupo.id}
          valoresIniciais={{
            nome: grupo.nome,
            descricao: grupo.descricao ?? "",
            ativo: grupo.ativo,
          }}
        />
      </div>
    </div>
  );
}
