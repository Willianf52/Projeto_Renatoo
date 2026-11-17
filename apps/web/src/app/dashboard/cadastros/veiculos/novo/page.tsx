import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { CarIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { VeiculoForm } from "../VeiculoForm";
import { getUsuariosParaSelecao } from "../queries";

/** Pagina sem `async`: ver `grupo-de-sites/novo/page.tsx`. */
export default function NovoVeiculoPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={6} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  // O RLS recusaria o insert; aqui so poupa preencher o formulario a toa.
  if (!(await podeAdministrarCadastros())) redirect("/dashboard/cadastros/veiculos");

  const usuarios = await getUsuariosParaSelecao();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Veículos" }, { label: "Novo" }]} />
      </div>
      <div className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up" style={{ animationDelay: "80ms" }}>
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <CarIcon className="h-4 w-4" />
            Novo Veículo
          </h1>
        </div>
        <VeiculoForm
          usuarios={usuarios}
          valoresIniciais={{ placa: "", modelo: "", cor: "", empresa: "", usuarioId: "", kmUltimaRevisao: "", ativo: true }}
        />
      </div>
    </div>
  );
}
