import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { CarIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { VeiculoForm } from "../../VeiculoForm";
import { getUsuariosParaSelecao, getVeiculo } from "../../queries";
import { placaNaTela } from "../../regras";

/** Pagina sem `async`: ver `grupo-de-sites/[id]/editar/page.tsx`. */
export default function EditarVeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={6} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const id = idNaUrl((await params).id);
  if (id === null) notFound();
  if (!(await podeAdministrarCadastros())) redirect("/dashboard/cadastros/veiculos");

  const [veiculo, usuarios] = await Promise.all([getVeiculo(id), getUsuariosParaSelecao()]);
  if (!veiculo) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Veículos" }, { label: placaNaTela(veiculo.placa) }]} />
      </div>
      <div className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up" style={{ animationDelay: "80ms" }}>
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <CarIcon className="h-4 w-4" />
            Editar Veículo
          </h1>
        </div>
        <VeiculoForm
          id={veiculo.id}
          usuarios={usuarios}
          valoresIniciais={{
            placa: placaNaTela(veiculo.placa),
            modelo: veiculo.modelo,
            cor: veiculo.cor,
            empresa: veiculo.empresa,
            usuarioId: veiculo.usuario_id ?? "",
            kmUltimaRevisao: String(veiculo.km_ultima_revisao),
            ativo: veiculo.ativo,
          }}
        />
      </div>
    </div>
  );
}
