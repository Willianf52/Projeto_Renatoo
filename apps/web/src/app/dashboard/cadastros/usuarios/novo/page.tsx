import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { UserIcon } from "@/components/dashboard/icons";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { UsuarioForm } from "../UsuarioForm";
import { TIPO_PADRAO } from "../constantes";
import { getGruposSitesParaEscopo, getSuperiores } from "../queries";

const VALORES_VAZIOS = {
  nomeCompleto: "",
  email: "",
  senha: "",
  login: "",
  funcao: "",
  // Mesmo default do trigger `handle_new_user` (migration 0008): o nivel mais
  // baixo, para que conceder mais seja sempre um ato deliberado.
  cargo: "OPERADOR",
  // Mesmo default da coluna (migration 0019): o caso comum e cadastrar uma
  // pessoa, e conta de integracao e a excecao que se escolhe.
  tipo: TIPO_PADRAO,
  superiorId: "",
  // Ja marcado: quem chega aqui e um gestor criando alguem de proposito, e o
  // caso comum e que a pessoa deva conseguir entrar. A 0008 defende contra
  // cadastro vindo de fora do app, que e outro caminho.
  ativo: true,
  gruposDoCliente: [] as string[],
};

/**
 * Pagina sem `async`: com Cache Components, o `await` no corpo (permissao e
 * consultas recortadas por RLS) travava a navegacao ate tudo voltar -- ver
 * `site-planta/novo/page.tsx`.
 */
export default function NovoUsuarioPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-3xl" campos={8} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  // A action confere de novo -- ela e o unico portao de verdade, porque
  // escreve com service_role. Aqui e so para nao mostrar um formulario que
  // sera recusado no envio.
  if (!(await podeAdministrarUsuarios())) {
    redirect("/dashboard/cadastros/usuarios");
  }

  const [superiores, gruposSites] = await Promise.all([
    getSuperiores(),
    getGruposSitesParaEscopo(),
  ]);

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Usuários" }, { label: "Novo" }]} />
      </div>

      <div
        className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UserIcon className="h-4 w-4" />
            Novo Usuário
          </h1>
        </div>

        <UsuarioForm
          valoresIniciais={VALORES_VAZIOS}
          superiores={superiores}
          gruposSites={gruposSites}
        />
      </div>
    </div>
  );
}
