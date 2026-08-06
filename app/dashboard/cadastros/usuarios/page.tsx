import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import {
  FilterIcon,
  PencilIcon,
  PlusCircleIcon,
  UserIcon,
} from "@/components/dashboard/icons";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import {
  getGruposUsuarios,
  getUsuarios,
  podeVerTodaOperacao,
  toTableRow,
  NIVEIS_ACESSO,
  PAGE_SIZE,
  SITUACOES,
  type UsuarioFiltros,
} from "./queries";

const TABLE_COLUMNS = [
  "Nome",
  "Login",
  "E-mail",
  "Função",
  "Nível de Acesso",
  "Superior",
  "Situação",
  "Ações",
];

type SearchParams = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

function extrairFiltros(params: SearchParams): UsuarioFiltros {
  return {
    nome: primeiro(params.nome),
    email: primeiro(params.email),
    nivelAcesso: primeiro(params.nivel_acesso),
    grupoUsuarios: primeiro(params.grupo_usuarios),
    situacao: primeiro(params.situacao) as "ativos" | "inativos" | undefined,
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [grupos, vendoTodos, podeAdministrar, resultado] = await Promise.all([
    getGruposUsuarios(),
    podeVerTodaOperacao(),
    podeAdministrarUsuarios(),
    getUsuarios(filtros),
  ]);

  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  // Quem nao administra continua vendo o botao, desabilitado: escondê-lo faria
  // a coluna "Ações" aparecer vazia, sem explicar por que. Mesmo criterio das
  // demais telas de cadastro.
  const rows = resultado.rows.map((usuario) => [
    ...toTableRow(usuario),
    podeAdministrar ? (
      <Acao
        key={usuario.id}
        titulo={`Editar ${usuario.nome_completo || usuario.email}`}
        href={`/dashboard/cadastros/usuarios/${usuario.id}/editar`}
        className="bg-white/10"
      >
        <PencilIcon className="h-4 w-4" />
      </Acao>
    ) : (
      <AcaoDesabilitada
        key={usuario.id}
        titulo="Editar usuário"
        motivo="apenas Gestor administra usuários"
        className="bg-white/10"
      >
        <PencilIcon className="h-4 w-4" />
      </AcaoDesabilitada>
    ),
  ]);

  const buildPageHref = (pagina: number) => {
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      const v = primeiro(valor);
      if (v) query.set(chave, v);
    }
    query.set("pagina", String(pagina));
    return `?${query.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Usuários" }]} />
      </div>

      {/* O RLS (migration 0006) limita a leitura ao proprio perfil para quem
          nao e gestao. Sem este aviso a tela parece quebrada: mostra uma linha
          so e nao explica por que. */}
      {!vendoTodos && (
        <p
          className="rounded-lg border border-slate-800 bg-brand-surface px-4 py-3 text-sm text-brand-muted animate-fade-in"
          style={{ animationDelay: "40ms" }}
        >
          Seu nível de acesso permite visualizar apenas o próprio cadastro. A
          lista completa exige nível Gestor ou Supervisor.
        </p>
      )}

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UserIcon className="h-4 w-4" />
            Usuários
          </h1>
          {podeAdministrar ? (
            <Acao
              titulo="Novo usuário"
              href="/dashboard/cadastros/usuarios/novo"
              className="bg-amber-500/80"
            >
              <PlusCircleIcon className="h-4 w-4" />
            </Acao>
          ) : (
            <AcaoDesabilitada
              titulo="Novo usuário"
              motivo="apenas Gestor administra usuários"
              className="bg-amber-500/40"
            >
              <PlusCircleIcon className="h-4 w-4" />
            </AcaoDesabilitada>
          )}
        </div>

        {/* Mesmo mecanismo da tela de coletas: form GET, filtros na
            querystring, sem JS no cliente. */}
        <form
          method="get"
          className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end"
        >
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <FilterInput label="Nome" name="nome" defaultValue={filtros.nome} />
            <FilterInput label="E-mail" name="email" defaultValue={filtros.email} />
            <FilterSelect
              label="Nível de Acesso"
              name="nivel_acesso"
              defaultValue={filtros.nivelAcesso}
              options={NIVEIS_ACESSO}
            />
            <FilterSelect
              label="Situação"
              name="situacao"
              defaultValue={filtros.situacao}
              options={SITUACOES}
            />
            {grupos.length > 0 && (
              <FilterSelect
                label="Grupo de Usuários"
                name="grupo_usuarios"
                defaultValue={filtros.grupoUsuarios}
                options={grupos}
              />
            )}
          </div>

          <button
            type="submit"
            className="group flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-brand-green px-6 text-sm font-semibold text-brand-navy shadow-sm transition-all duration-200 hover:bg-brand-green-hover hover:shadow-lg hover:shadow-brand-green/30 focus:outline-none focus:ring-2 focus:ring-brand-green active:scale-[0.97] xl:w-52"
          >
            <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
            Filtrar
          </button>
        </form>

        <DataTable
          columns={TABLE_COLUMNS}
          rows={rows}
          page={filtros.pagina}
          totalPages={totalPages}
          totalItems={resultado.totalItems}
          buildPageHref={buildPageHref}
          minWidth="min-w-[1000px]"
          emptyTitle="Nenhum usuário encontrado"
          emptyDescription="Ajuste os filtros acima para localizar cadastros."
        />
      </div>
    </div>
  );
}
