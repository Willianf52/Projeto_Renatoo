import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { BuildingIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { SiteForm } from "../../SiteForm";
import { getOpcoes, getSite } from "../../queries";

const LISTAGEM = "/dashboard/cadastros/site-planta";

export default async function EditarSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNumerico = Number(id);

  // `/site-planta/abc/editar` casa com a rota; sem esta checagem viraria uma
  // consulta com NaN e um erro do Postgres em vez de um 404.
  if (!Number.isInteger(idNumerico)) notFound();

  if (!(await podeAdministrarCadastros())) {
    redirect(LISTAGEM);
  }

  const [site, opcoes] = await Promise.all([getSite(idNumerico), getOpcoes()]);
  if (!site) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Cadastros" }, { label: "Site / Planta" }, { label: site.nome }]}
        />
      </div>

      <div
        className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BuildingIcon className="h-4 w-4" />
            Editar Site / Planta
          </h1>
        </div>

        <SiteForm
          id={site.id}
          opcoes={opcoes}
          valoresIniciais={{
            nome: site.nome,
            sigla: site.sigla ?? "",
            // Os selects trabalham com string; o banco devolve number/uuid.
            grupoSiteId: String(site.grupo_site_id),
            tipoServicoId: site.tipo_servico_id === null ? "" : String(site.tipo_servico_id),
            responsavelId: site.responsavel_id ?? "",
            regional: site.regional ?? "",
            cidade: site.cidade ?? "",
            uf: site.uf ?? "",
            // Coordenada nula e "ainda nao cadastrada" (migration 0003): vira
            // campo vazio, nao "null" nem "0".
            latitude: site.latitude === null ? "" : String(site.latitude),
            longitude: site.longitude === null ? "" : String(site.longitude),
            observacao: site.observacao ?? "",
            ativo: site.ativo,
          }}
        />
      </div>
    </div>
  );
}
