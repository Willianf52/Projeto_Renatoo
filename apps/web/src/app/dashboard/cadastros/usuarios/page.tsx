import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  AcoesEsqueleto,
  FiltrosEmLinhaEsqueleto,
  TabelaEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import {
  FilterIcon,
  PencilIcon,
  PlusCircleIcon,
  UserIcon,
} from "@/components/dashboard/icons";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import {
  getFuncoes,
  getGruposUsuarios,
  getUsuarios,
  podeVerTodaOperacao,
  toTableRow,
  NIVEIS_ACESSO,
  PAGE_SIZE,
  SITUACOES,
  TIPOS_USUARIO,
  type UsuarioFiltros,
} from "./queries";

/** Mesma ordem de `toTableRow` -- ver o comentario de la. */
const TABLE_COLUMNS = [
  "Nome",
  "Login",
  "Usuário Superior",
  "E-mail",
  "Função",
  "Nível de Acesso",
  "Situação",
  "Ações",
];

const MIN_WIDTH = "min-w-[1000px]";

/** `auto-fit` em vez de um numero fixo de colunas por breakpoint: o numero de
 * campos aqui varia (o select de Grupo de Usuários so aparece quando ha
 * grupos), e um `xl:grid-cols-5` escrito a mao volta a quebrar a linha assim
 * que entrar o sexto. Cada trilha tem no minimo 11rem e divide a sobra por
 * igual; quando nao cabem todas, a linha quebra sozinha. */
const GRADE_DE_FILTROS = "grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]";

type SearchParams = Record<string, string | string[] | undefined>;
type SearchParamsPromise = Promise<SearchParams>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

function extrairFiltros(params: SearchParams): UsuarioFiltros {
  return {
    busca: primeiro(params.busca),
    funcao: primeiro(params.funcao),
    tipo: primeiro(params.tipo),
    nivelAcesso: primeiro(params.nivel_acesso),
    grupoUsuarios: primeiro(params.grupo_usuarios),
    situacao: primeiro(params.situacao) as "ativos" | "inativos" | undefined,
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

/**
 * Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components).
 *
 * `podeVerTodaOperacao()` e `podeAdministrarUsuarios()` sao pedidas de mais de
 * uma fronteira; as duas sao memoizadas por requisicao (`queries.ts` e
 * `lib/permissoes.ts`), entao o numero de round-trips nao muda.
 */
export default function UsuariosPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Usuários" }]} />
      </div>

      <Suspense fallback={null}>
        <AvisoDeEscopo />
      </Suspense>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UserIcon className="h-4 w-4" />
            Usuários
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={1} />}>
            <AcaoDeNovoUsuario />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto campos={5} gradeInterna={GRADE_DE_FILTROS} />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={TABLE_COLUMNS.length} minWidth={MIN_WIDTH} />}>
          <TabelaDeUsuarios searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * O RLS (migration 0006) limita a leitura ao proprio perfil para quem nao e
 * gestao. Sem este aviso a tela parece quebrada: mostra uma linha so e nao
 * explica por que.
 */
async function AvisoDeEscopo() {
  if (await podeVerTodaOperacao()) return null;

  return (
    <p
      className="rounded-lg border border-slate-800 bg-brand-surface px-4 py-3 text-sm text-brand-muted animate-fade-in"
      style={{ animationDelay: "40ms" }}
    >
      Seu nível de acesso permite visualizar apenas o próprio cadastro. A lista completa exige
      nível Gestor ou Supervisor.
    </p>
  );
}

async function AcaoDeNovoUsuario() {
  return (await podeAdministrarUsuarios()) ? (
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
  );
}

/** Mesmo mecanismo da tela de coletas: form GET, filtros na querystring, sem
 * JS no cliente. */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const [grupos, funcoes] = await Promise.all([getGruposUsuarios(), getFuncoes()]);

  return (
    <form
      method="get"
      className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end"
    >
      <div className={`min-w-0 flex-1 ${GRADE_DE_FILTROS}`}>
        {/* Um campo so para nome, login e e-mail: ver `comBusca` em
            queries.ts. */}
        <FilterInput label="Busca Livre..." name="busca" defaultValue={filtros.busca} />
        <FilterSelect
          label="Situação"
          name="situacao"
          defaultValue={filtros.situacao}
          options={SITUACOES}
        />
        <FilterSelect
          label="Nível de Acesso"
          name="nivel_acesso"
          defaultValue={filtros.nivelAcesso}
          options={NIVEIS_ACESSO}
        />
        {/* Funcoes conhecidas mais o que estiver gravado -- ver `getFuncoes`.
            Sempre visivel: a lista nunca vem vazia. */}
        <FilterSelect label="Função" name="funcao" defaultValue={filtros.funcao} options={funcoes} />
        <FilterSelect
          label="Tipo de Usuário"
          placeholder="Todos"
          name="tipo"
          defaultValue={filtros.tipo}
          options={TIPOS_USUARIO}
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

      <Button type="submit" className="group shrink-0 xl:w-52">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function TabelaDeUsuarios({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [resultado, podeAdministrar] = await Promise.all([
    getUsuarios(filtros),
    podeAdministrarUsuarios(),
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
    <DataTable
      columns={TABLE_COLUMNS}
      rows={rows}
      page={filtros.pagina}
      totalPages={totalPages}
      totalItems={resultado.totalItems}
      buildPageHref={buildPageHref}
      minWidth={MIN_WIDTH}
      emptyTitle="Nenhum usuário encontrado"
      emptyDescription="Ajuste os filtros acima para localizar cadastros."
    />
  );
}
