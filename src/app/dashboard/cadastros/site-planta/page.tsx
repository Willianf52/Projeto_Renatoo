import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import {
  BuildingIcon,
  ExcelIcon,
  FilterIcon,
  PdfIcon,
  PencilIcon,
  PlusCircleIcon,
} from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import {
  extrairFiltros,
  getOpcoes,
  getSites,
  montarHierarquia,
  primeiro,
  toTableRow,
  COLUNAS_EXPORTACAO,
  INDICE_HIERARQUIA,
  PAGE_SIZE,
  SITUACOES,
  type SearchParams,
  type SiteRow,
} from "./queries";

/** Cadeia organizacao > grupo > site, com o ultimo nivel destacado: e o
 * registro da linha, os anteriores sao contexto. */
function Hierarquia({ site }: { site: SiteRow }) {
  const niveis = montarHierarquia(site);

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {niveis.map((nivel, indice) => (
        <span key={indice} className="inline-flex items-center gap-1">
          {indice > 0 && <span className="text-brand-muted">›</span>}
          <span className={indice === niveis.length - 1 ? "text-white" : "text-brand-muted"}>
            {nivel}
          </span>
        </span>
      ))}
    </span>
  );
}

// A ultima coluna so existe na tela: a exportacao (COLUNAS_EXPORTACAO) nao a
// tem, pelo mesmo motivo que a de coletas nao tem.
const TABLE_COLUMNS = [...COLUNAS_EXPORTACAO, "Ações"];

export default async function SitePlantaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [resultado, opcoes, podeAdministrar] = await Promise.all([
    getSites(filtros),
    getOpcoes(),
    podeAdministrarCadastros(),
  ]);

  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  // Quem nao administra continua vendo o botao, desabilitado: escondê-lo faria
  // a coluna "Ações" aparecer vazia, sem explicar por que. Mesmo criterio da
  // tela de Grupo de Sites.
  const rows = resultado.rows.map((site) => [
    // A linha de texto e a mesma que a exportacao usa; a tela troca so a celula
    // de Hierarquia pela cadeia formatada. Manter a base compartilhada evita as
    // duas ordens divergirem em silencio.
    ...toTableRow(site).map((celula, indice) => {
      if (indice === INDICE_HIERARQUIA) return <Hierarquia key="hierarquia" site={site} />;
      return celula;
    }),
    podeAdministrar ? (
      <Acao
        key={site.id}
        titulo={`Editar ${site.nome}`}
        href={`/dashboard/cadastros/site-planta/${site.id}/editar`}
        className="bg-white/10"
      >
        <PencilIcon className="h-4 w-4" />
      </Acao>
    ) : (
      <AcaoDesabilitada
        key={site.id}
        titulo="Editar site"
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

  // Mesmos filtros da listagem, sem a paginacao -- getSitesParaExportar ignora
  // pagina de proposito (ver queries.ts).
  const queryExportacao = (() => {
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      if (chave === "pagina") continue;
      const v = primeiro(valor);
      if (v) query.set(chave, v);
    }
    const texto = query.toString();
    return texto ? `?${texto}` : "";
  })();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Site / Planta" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          {/* Contador no titulo, como na referencia -- mas so o total. O
              "(223/500)" de la e teto de plano, que aqui nao existe: inventar
              um denominador seria numero falso na tela. */}
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BuildingIcon className="h-4 w-4" />
            Site / Planta ({resultado.totalItems})
          </h1>
          <div className="flex items-center gap-2">
            <Acao
              titulo="Exportar para Excel"
              href={`/dashboard/cadastros/site-planta/export/excel${queryExportacao}`}
              className="bg-emerald-600/40"
              target="_blank"
            >
              <ExcelIcon className="h-4 w-4" />
            </Acao>
            <Acao
              titulo="Exportar para PDF"
              href={`/dashboard/cadastros/site-planta/export/pdf${queryExportacao}`}
              className="bg-red-600/40"
              target="_blank"
            >
              <PdfIcon className="h-4 w-4" />
            </Acao>
            {podeAdministrar ? (
              <Acao
                titulo="Novo site"
                href="/dashboard/cadastros/site-planta/novo"
                className="bg-amber-500/80"
              >
                <PlusCircleIcon className="h-4 w-4" />
              </Acao>
            ) : (
              <AcaoDesabilitada
                titulo="Novo site"
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
          {/* `auto-fit` pelo mesmo motivo da tela de Usuarios: sao cinco campos
              e um numero fixo de colunas por breakpoint quebraria a linha. */}
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
            <FilterSelect
              label="Responsável"
              name="responsavel"
              defaultValue={filtros.responsavel}
              options={opcoes.responsaveis}
            />
            <FilterSelect
              label="Tipo de Serviços"
              name="tipo_servico"
              defaultValue={filtros.tipoServico}
              options={opcoes.tiposServico}
            />
            {/* Sem placeholder vazio: "Todos" ja e a opcao de nao filtrar, e o
                padrao e "Ativos" -- ver SITUACAO_PADRAO em queries.ts. */}
            <FilterSelect
              label="Situação"
              name="situacao"
              defaultValue={filtros.situacao}
              options={SITUACOES}
              semOpcaoVazia
            />
            <FilterInput
              label="Busca Livre (ID, Regional, Nome)"
              name="busca"
              defaultValue={filtros.busca}
            />
            <FilterSelect
              label="Grupo de Sites"
              name="grupo_site"
              defaultValue={filtros.grupoSite}
              options={opcoes.gruposSites}
            />
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
          minWidth="min-w-[1100px]"
          emptyTitle="Nenhum site encontrado"
          emptyDescription="Ajuste os filtros acima para localizar cadastros."
        />
      </div>
    </div>
  );
}
