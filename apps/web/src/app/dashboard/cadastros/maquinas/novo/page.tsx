import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { SlidersIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { MaquinaForm } from "../Formularios";
import { getSitesParaSelecao } from "../queries";

/** Pagina sem `async`: ver `grupo-de-sites/novo/page.tsx`. */
export default function NovaMaquinaPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={5} />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  if (!(await podeAdministrarCadastros())) redirect("/dashboard/cadastros/maquinas");
  const [sites, { site }] = await Promise.all([getSitesParaSelecao(), searchParams]);

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Máquinas" }, { label: "Nova" }]} />
      </div>
      <div className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up" style={{ animationDelay: "80ms" }}>
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <SlidersIcon className="h-4 w-4" />
            Nova Máquina
          </h1>
        </div>
        <MaquinaForm
          sites={sites}
          valoresIniciais={{ siteId: site ?? "", modelo: "", patrimonio: "", descricao: "", ativo: true }}
        />
      </div>
    </div>
  );
}
