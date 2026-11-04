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
import { createClient } from "@/lib/supabase/server";
import { AnexosDoSite } from "../../AnexosDoSite";

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

  const supabase = await createClient();
  const [site, opcoes, sitesSuperiores, anexos] = await Promise.all([
    getSite(idNumerico),
    getOpcoes(),
    getSitesParaSuperior(idNumerico),
    // "Anexos" do sistema de referencia (0089).
    supabase
      .from("site_anexos")
      .select("id, nome_original, criado_em")
      .eq("site_id", idNumerico)
      .order("criado_em", { ascending: false }),
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

      <div className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up">
        <div className="border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Anexos</h2>
        </div>
        <AnexosDoSite
          siteId={site.id}
          anexos={(anexos.data ?? []).map((a) => ({ id: a.id, nome: a.nome_original, criadoEm: a.criado_em }))}
        />
      </div>
    </div>
  );
}
