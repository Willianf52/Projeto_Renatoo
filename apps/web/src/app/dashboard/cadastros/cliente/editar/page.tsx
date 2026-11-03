import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { BuildingIcon } from "@/components/dashboard/icons";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { ClienteForm } from "../ClienteForm";
import { cnpjFormatado, getCliente, LISTAGEM } from "../queries";

export default function EditarClientePage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-4xl" campos={8} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  // O RLS recusaria a gravacao, mas so depois de preencher o formulario.
  if (!(await podeAdministrarUsuarios())) redirect(LISTAGEM);
  const cliente = await getCliente();
  if (!cliente) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Cliente", href: LISTAGEM }, { label: "Editar" }]} />
      </div>
      <div
        className="max-w-4xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BuildingIcon className="h-4 w-4" />
            Editar Cliente
          </h1>
        </div>
        <ClienteForm
          temLogotipo={Boolean(cliente.logotipoPath)}
          valoresIniciais={{
            nomeFantasia: cliente.nomeFantasia,
            razaoSocial: cliente.razaoSocial,
            cnpj: cnpjFormatado(cliente.cnpj),
            ramoAtividade: cliente.ramoAtividade,
            ativo: cliente.ativo,
            tituloPdf: cliente.tituloPdf,
            nomeFantasiaNoRemetente: cliente.nomeFantasiaNoRemetente,
            legendaNasImagens: cliente.legendaNasImagens,
            minCaracteresDescricao: String(cliente.minCaracteresDescricao),
            minCaracteresAcoes: String(cliente.minCaracteresAcoes),
          }}
        />
      </div>
    </div>
  );
}
