import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterInput } from "@/components/dashboard/FilterField";
import {
  ExcelIcon,
  FilterIcon,
  PdfIcon,
  PencilIcon,
  PlusCircleIcon,
  UsersIcon,
} from "@/components/dashboard/icons";
import { podeAdministrarGruposDeUsuarios } from "@/lib/permissoes";
import {
  extrairFiltros,
  getGruposUsuarios,
  primeiro,
  toTableRow,
  COLUNAS_EXPORTACAO,
  PAGE_SIZE,
  type SearchParams,
} from "./queries";

// A ultima coluna so existe na tela: a exportacao nao a tem.
const TABLE_COLUMNS = [...COLUNAS_EXPORTACAO, "Ações"];

export default async function GrupoDeUsuariosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [resultado, podeAdministrar] = await Promise.all([
    getGruposUsuarios(filtros),
    podeAdministrarGruposDeUsuarios(),
  ]);

  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  // Quem nao administra continua vendo o botao, desabilitado: escondê-lo faria
  // a coluna "Ações" aparecer vazia, sem explicar por que.
  const rows = resultado.rows.map((grupo) => [
    ...toTableRow(grupo),
    podeAdministrar ? (
      <Acao
        key={grupo.id}
        titulo={`Editar ${grupo.nome}`}
        href={`/dashboard/cadastros/grupo-de-usuarios/${grupo.id}/editar`}
        className="bg-white/10"
      >
        <PencilIcon className="h-4 w-4" />
      </Acao>
    ) : (
      <AcaoDesabilitada
        key={grupo.id}
        titulo="Editar grupo"
        motivo="você não tem permissão"
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

  const queryExportacao = filtros.busca ? `?busca=${encodeURIComponent(filtros.busca)}` : "";

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Grupo de Usuários" }]} />
      </div>

      {/* A policy de leitura (migration 0006) libera `grupos_usuarios` apenas
          para gestão. Sem este aviso a tela parece quebrada: mostra a lista
          vazia e não explica por quê. Mesmo critério da tela de Usuários. */}
      {!podeAdministrar && (
        <p
          className="rounded-lg border border-slate-800 bg-brand-surface px-4 py-3 text-sm text-brand-muted animate-fade-in"
          style={{ animationDelay: "40ms" }}
        >
          Seu nível de acesso não permite administrar grupos de usuários. A lista exige nível
          Gestor ou Supervisor.
        </p>
      )}

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UsersIcon className="h-4 w-4" />
            Grupo de Usuários
          </h1>
          <div className="flex items-center gap-2">
            <Acao
              titulo="Exportar para Excel"
              href={`/dashboard/cadastros/grupo-de-usuarios/export/excel${queryExportacao}`}
              className="bg-emerald-600/40"
              target="_blank"
            >
              <ExcelIcon className="h-4 w-4" />
            </Acao>
            <Acao
              titulo="Exportar para PDF"
              href={`/dashboard/cadastros/grupo-de-usuarios/export/pdf${queryExportacao}`}
              className="bg-red-600/40"
              target="_blank"
            >
              <PdfIcon className="h-4 w-4" />
            </Acao>
            {podeAdministrar ? (
              <Acao
                titulo="Novo grupo"
                href="/dashboard/cadastros/grupo-de-usuarios/novo"
                className="bg-amber-500/80"
              >
                <PlusCircleIcon className="h-4 w-4" />
              </Acao>
            ) : (
              <AcaoDesabilitada
                titulo="Novo grupo"
                motivo="você não tem permissão"
                className="bg-amber-500/40"
              >
                <PlusCircleIcon className="h-4 w-4" />
              </AcaoDesabilitada>
            )}
          </div>
        </div>

        {/* Mesmo mecanismo das demais telas: form GET, filtros na querystring,
            sem JS no cliente. */}
        <form
          method="get"
          className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end"
        >
          <div className="min-w-0 flex-1">
            <FilterInput label="Busca Livre..." name="busca" defaultValue={filtros.busca} />
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
          minWidth="min-w-[700px]"
          emptyTitle="Nenhum grupo de usuários encontrado"
          emptyDescription="Ajuste a busca acima para localizar cadastros."
        />
      </div>
    </div>
  );
}
