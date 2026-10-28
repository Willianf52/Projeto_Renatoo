import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { UploadIcon } from "@/components/dashboard/icons";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { ImportarUsuariosForm } from "./ImportarUsuariosForm";

/**
 * A importacao cria uma conta por vez (autenticacao, perfil, trilha, escopo e
 * dados pessoais): 20 usuarios passam do tempo padrao de uma funcao. Vale para
 * as Server Actions desta pagina.
 */
export const maxDuration = 60;

/** Mesmo arranjo de `novo/page.tsx`: o `await` da permissao fica dentro do Suspense. */
export default function ImportarUsuariosPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-3xl" campos={2} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (!(await podeAdministrarUsuarios())) {
    redirect("/dashboard/cadastros/usuarios");
  }

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Configurações" }, { label: "Usuários" }, { label: "Importar" }]} />
      </div>

      <div
        className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UploadIcon className="h-4 w-4" />
            Importar Usuários
          </h1>
        </div>

        <ImportarUsuariosForm />
      </div>
    </div>
  );
}
