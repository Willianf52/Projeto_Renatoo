import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { SitemapIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { GrupoSiteForm } from "../GrupoSiteForm";
import { getGruposSitesParaPai, getSitesParaSelecao } from "../queries";

export default async function NovoGrupoDeSitesPage() {
  // O RLS ja recusaria o insert, mas seria depois de preencher o formulario
  // inteiro. Quem nao administra nem chega a ver a tela.
  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/cadastros/grupo-de-sites");
  }

  const [gruposPai, sites] = await Promise.all([getGruposSitesParaPai(), getSitesParaSelecao()]);

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Cadastros" }, { label: "Grupo de Sites" }, { label: "Novo" }]}
        />
      </div>

      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <SitemapIcon className="h-4 w-4" />
            Novo Grupo de Sites
          </h1>
        </div>

        <GrupoSiteForm
          gruposPai={gruposPai}
          sites={sites}
          valoresIniciais={{ nome: "", descricao: "", ativo: true, grupoPaiId: "", siteIds: [] }}
        />
      </div>
    </div>
  );
}
