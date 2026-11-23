import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { SlidersIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { MaquinaForm } from "../../Formularios";
import { getMaquina, getSitesParaSelecao } from "../../queries";

/** Pagina sem `async`: ver `grupo-de-sites/[id]/editar/page.tsx`. */
export default function EditarMaquinaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={5} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const id = idNaUrl((await params).id);
  if (id === null) notFound();
  if (!(await podeAdministrarCadastros())) redirect("/dashboard/cadastros/maquinas");

  const [maquina, sites] = await Promise.all([getMaquina(id), getSitesParaSelecao()]);
  if (!maquina) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Máquinas" }, { label: maquina.modelo }]} />
      </div>
      <div className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up" style={{ animationDelay: "80ms" }}>
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <SlidersIcon className="h-4 w-4" />
            Editar Máquina
          </h1>
        </div>
        <MaquinaForm
          id={maquina.id}
          sites={sites}
          valoresIniciais={{
            siteId: String(maquina.site_id),
            modelo: maquina.modelo,
            patrimonio: maquina.patrimonio,
            descricao: maquina.descricao,
            ativo: maquina.ativo,
          }}
        />
      </div>
    </div>
  );
}
