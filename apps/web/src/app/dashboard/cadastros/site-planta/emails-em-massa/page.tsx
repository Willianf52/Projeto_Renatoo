import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { MailIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { EmailsEmMassaForm } from "./EmailsEmMassaForm";
import { getOpcoesDaAlteracaoEmMassa } from "./queries";

/** Mesmo arranjo de `importar/page.tsx`: o `await` da permissao fica dentro do Suspense. */
export default function EmailsEmMassaPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-3xl" campos={4} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/cadastros/site-planta");
  }

  const { grupos, locais } = await getOpcoesDaAlteracaoEmMassa();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Cadastros" }, { label: "Site / Planta" }, { label: "Alterar E-mails em Massa" }]}
        />
      </div>

      <div
        className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <MailIcon className="h-4 w-4" />
            Alterar E-mails em Massa
          </h1>
        </div>

        <EmailsEmMassaForm grupos={grupos} locais={locais} />
      </div>
    </div>
  );
}
