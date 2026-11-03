import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { BuildingIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { SiteForm } from "../../SiteForm";
import { valoresDoSite } from "../../constantes";
import { getOpcoes, getSite, getSitesParaSuperior } from "../../queries";
import { idNaUrl } from "@/lib/id-na-url";

const LISTAGEM = "/dashboard/cadastros/site-planta";

/**
 * Pagina sem `async`: com Cache Components, o `await` no corpo (permissao e
 * consultas recortadas por RLS) travava a navegacao ate tudo voltar -- ver
 * `site-planta/novo/page.tsx`.
 */
export default function EditarSitePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-3xl" campos={12} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNumerico = idNaUrl(id);

  // `/site-planta/abc/editar` casa com a rota; sem esta checagem viraria uma
  // consulta com NaN e um erro do Postgres em vez de um 404.
  if (idNumerico === null) notFound();

  if (!(await podeAdministrarCadastros())) {
    redirect(LISTAGEM);
  }

  const [site, opcoes, sitesSuperiores] = await Promise.all([
    getSite(idNumerico),
    getOpcoes(),
    getSitesParaSuperior(idNumerico),
  ]);
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
          sitesSuperiores={sitesSuperiores}
          valoresIniciais={valoresDoSite(site)}
        />
      </div>
    </div>
  );
}
