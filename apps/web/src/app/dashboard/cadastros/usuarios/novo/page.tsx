import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { UserIcon } from "@/components/dashboard/icons";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { UsuarioForm } from "../UsuarioForm";
import { valoresParaDuplicar } from "../constantes";
import {
  getEscopoDoCliente,
  getGruposSitesParaEscopo,
  getSuperiores,
  getUsuario,
} from "../queries";


/** Locais, como em `../page.tsx`: o modulo de Usuarios nao exporta os dois. */
type SearchParams = Record<string, string | string[] | undefined>;
type SearchParamsPromise = Promise<SearchParams>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/**
 * Pagina sem `async`: com Cache Components, o `await` no corpo (permissao e
 * consultas recortadas por RLS) travava a navegacao ate tudo voltar -- ver
 * `site-planta/novo/page.tsx`.
 */
export default function NovoUsuarioPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-3xl" campos={8} />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * `?duplicar=<id>` chega do botao Duplicar da listagem, como no sistema de
 * referencia.
 *
 * O que e copiado e o PERFIL DE ACESSO -- cargo, tipo, funcao, superior,
 * situacao e os grupos do escopo de cliente. Nome, e-mail, login e senha vem
 * em branco de proposito: sao o que identifica a pessoa, e os dois primeiros
 * criam a conta de autenticacao no Supabase, onde o e-mail e unico. Copiar
 * o e-mail so produziria uma recusa no envio.
 */
async function Conteudo({ searchParams }: { searchParams: SearchParamsPromise }) {
  // A action confere de novo -- ela e o unico portao de verdade, porque
  // escreve com service_role. Aqui e so para nao mostrar um formulario que
  // sera recusado no envio.
  if (!(await podeAdministrarUsuarios())) {
    redirect("/dashboard/cadastros/usuarios");
  }

  const idParaDuplicar = primeiro((await searchParams).duplicar);

  const [superiores, gruposSites, modelo, escopoDoModelo] = await Promise.all([
    getSuperiores(),
    getGruposSitesParaEscopo(),
    idParaDuplicar ? getUsuario(idParaDuplicar) : Promise.resolve(null),
    idParaDuplicar ? getEscopoDoCliente(idParaDuplicar) : Promise.resolve([]),
  ]);

  // Modelo que sumiu entre a listagem e o clique cai no formulario em branco:
  // a tela e "Novo Usuário" de qualquer jeito, e barrar a criacao por causa de
  // um atalho quebrado seria pior que perder o preenchimento.
  const valoresIniciais = valoresParaDuplicar(modelo, escopoDoModelo);

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
          {modelo && (
            <p className="mt-1 text-xs text-brand-muted">
              Copiando o acesso de{" "}
              <span className="text-white">{modelo.nome_completo || modelo.email}</span>. Nome,
              e-mail, login e senha não vêm junto.
            </p>
          )}
        </div>

        <UsuarioForm
          valoresIniciais={valoresIniciais}
          superiores={superiores}
          gruposSites={gruposSites}
        />
      </div>
    </div>
  );
}
