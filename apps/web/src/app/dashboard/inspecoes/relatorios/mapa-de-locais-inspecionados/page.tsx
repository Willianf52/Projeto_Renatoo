import Link from "next/link";
import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ExcelIcon,
  FilterIcon,
  PdfIcon,
  SearchIcon,
  SitemapIcon,
} from "@/components/dashboard/icons";
import {
  extrairFiltros,
  formatarDiaCurto,
  getMapaDeLocaisInspecionados,
  getOpcoesFiltros,
  primeiro,
  type SearchParams,
} from "./queries";

const PAGE_SIZE = 15;
const SEM_OPCAO_INATIVOS = [{ value: "sim", label: "Sim" }];

export default async function MapaDeLocaisInspecionadosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);
  const pagina = Math.max(1, Number(primeiro(params.pagina)) || 1);

  const [opcoes, mapa] = await Promise.all([getOpcoesFiltros(), getMapaDeLocaisInspecionados(filtros)]);

  const totalItems = mapa?.linhas.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const linhasPagina = mapa?.linhas.slice((pagina - 1) * PAGE_SIZE, (pagina - 1) * PAGE_SIZE + PAGE_SIZE) ?? [];

  const buildPageHref = (novaPagina: number) => {
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      if (chave === "pagina") continue;
      const v = primeiro(valor);
      if (v) query.set(chave, v);
    }
    query.set("pagina", String(novaPagina));
    return `?${query.toString()}`;
  };

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

  const podeVoltar = pagina > 1;
  const podeAvancar = pagina < totalPages;

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Inspeções" }, { label: "Relatórios" }, { label: "Mapa de Quantidade de Locais Inspecionados" }]}
        />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <SitemapIcon className="h-4 w-4" />
            Mapa de Quantidade de Locais Inspecionados
          </h1>
          <div className="flex items-center gap-2">
            <Acao
              titulo="Exportar para Excel"
              href={`/dashboard/inspecoes/relatorios/mapa-de-locais-inspecionados/export/excel${queryExportacao}`}
              className="bg-emerald-600/40"
              target="_blank"
            >
              <ExcelIcon className="h-4 w-4" />
            </Acao>
            <Acao
              titulo="Exportar para PDF"
              href={`/dashboard/inspecoes/relatorios/mapa-de-locais-inspecionados/export/pdf${queryExportacao}`}
              className="bg-red-600/40"
              target="_blank"
            >
              <PdfIcon className="h-4 w-4" />
            </Acao>
          </div>
        </div>

        {/* GET nativo. Grade de 6 colunas (a partir de xl) como em
            Coletas Importadas: 14 campos + Filtrar = 15 celulas, com
            col-start forcando a quebra nos mesmos pontos da referencia
            (5 campos / 4 campos / 5 campos + Filtrar). */}
        <form
          method="get"
          className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"
        >
          <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
          <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
          <FilterSelect
            label="Coletor de Dados"
            name="coletor_dados"
            defaultValue={filtros.coletorDados}
            options={opcoes.coletoresDados}
          />
          <FilterSelect
            label="Funcionários"
            name="funcionario"
            defaultValue={filtros.funcionario}
            options={opcoes.funcionarios}
          />
          <FilterSelect
            label="Checkpoint"
            name="checkpoint"
            defaultValue={filtros.checkpoint}
            options={opcoes.checkpoints}
          />

          <div className="xl:col-start-1">
            <FilterSelect
              label="Sites"
              name="sites"
              defaultValue={filtros.sites}
              options={opcoes.sitesAgrupados}
            />
          </div>
          <FilterSelect label="Local" name="local" defaultValue={filtros.local} options={opcoes.locais} />
          <FilterSelect label="Eventos" name="evento" defaultValue={filtros.evento} options={opcoes.eventos} />
          {/* Sem tabela de checklists no schema -- visivel, sem opcao (mesmo
              criterio de registro-de-rondas). */}
          <FilterSelect label="Checklists" name="checklist" options={[]} />

          <div className="xl:col-start-1">
            <FilterSelect
              label="Atividades"
              name="atividade"
              defaultValue={filtros.atividade}
              options={opcoes.atividades}
            />
          </div>
          <FilterSelect
            label="Grupos Sites"
            name="grupo_site"
            defaultValue={filtros.grupoSite}
            options={opcoes.gruposSites}
          />
          <FilterSelect
            label="Grupos Usuários"
            name="grupo_usuario"
            defaultValue={filtros.grupoUsuario}
            options={opcoes.gruposUsuarios}
          />
          <FilterSelect
            label="Locais Inativos"
            name="locais_inativos"
            defaultValue={filtros.locaisInativos ? "sim" : undefined}
            options={SEM_OPCAO_INATIVOS}
          />
          <FilterSelect label="Motivos" name="motivo" defaultValue={filtros.motivo} options={opcoes.motivos} />

          <Button type="submit" className="group">
            <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
            Filtrar
          </Button>
        </form>

        {mapa?.diasExcedidos && (
          <p className="border-b border-slate-800 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
            Período maior que o suportado — mostrando só os primeiros 62 dias. Ajuste as datas para ver o restante.
          </p>
        )}

        {mapa?.truncado && (
          <p className="border-b border-slate-800 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
            Período com mais leituras do que o suportado — as contagens abaixo estão incompletas. Reduza o período
            para ver os números corretos.
          </p>
        )}

        {!mapa ? (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center animate-fade-in-up">
            <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
              <SearchIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-white">Selecione um período</p>
            <p className="text-sm text-brand-muted">
              Escolha a Data Inicial e a Data Final acima e clique em Filtrar para ver o mapa de locais inspecionados.
            </p>
          </div>
        ) : linhasPagina.length === 0 ? (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center animate-fade-in-up">
            <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
              <SearchIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-white">Nenhum local encontrado</p>
            <p className="text-sm text-brand-muted">Ajuste os filtros acima para localizar registros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-b-lg">
            <table className="w-full min-w-[1200px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-brand-muted">
                  <th className="sticky left-0 z-10 bg-brand-surface px-3 py-2 font-semibold whitespace-nowrap">
                    Local
                  </th>
                  {mapa.dias.map((dia) => (
                    <th key={dia} className="px-2 py-2 text-center font-semibold whitespace-nowrap">
                      {formatarDiaCurto(dia)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {linhasPagina.map((linha, indice) => (
                  <tr
                    key={linha.siteId}
                    className="border-b border-slate-800/60 animate-fade-in-up hover:bg-white/5"
                    style={{ animationDelay: `${Math.min(indice, 12) * 30}ms` }}
                  >
                    <td className="sticky left-0 z-10 bg-brand-surface px-3 py-2 font-medium whitespace-nowrap text-brand-green">
                      {linha.siteNome}
                    </td>
                    {mapa.dias.map((dia) => {
                      const quantidade = linha.porDia[dia] ?? 0;
                      return (
                        <td
                          key={dia}
                          className={`px-2 py-2 text-center ${
                            quantidade > 0 ? "bg-emerald-500/20 font-medium text-emerald-300" : "text-brand-muted"
                          }`}
                        >
                          {quantidade}
                        </td>
                      );
                    })}
                    <td
                      className={`px-3 py-2 text-center font-semibold ${
                        linha.total === 0 ? "bg-red-500/20 text-red-300" : "text-white"
                      }`}
                    >
                      {linha.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-end gap-1 border-t border-slate-800 px-4 py-3">
              <PaginacaoBotao disabled={!podeVoltar} href={podeVoltar ? buildPageHref(1) : undefined} ariaLabel="Primeira página">
                <ChevronsLeftIcon className="h-4 w-4" />
              </PaginacaoBotao>
              <PaginacaoBotao
                disabled={!podeVoltar}
                href={podeVoltar ? buildPageHref(pagina - 1) : undefined}
                ariaLabel="Página anterior"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </PaginacaoBotao>
              <span className="px-3 text-xs text-brand-muted">
                Pág: {totalItems > 0 ? pagina : 0} de {totalPages} | Total: {totalItems} locais
              </span>
              <PaginacaoBotao
                disabled={!podeAvancar}
                href={podeAvancar ? buildPageHref(pagina + 1) : undefined}
                ariaLabel="Próxima página"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </PaginacaoBotao>
              <PaginacaoBotao
                disabled={!podeAvancar}
                href={podeAvancar ? buildPageHref(totalPages) : undefined}
                ariaLabel="Última página"
              >
                <ChevronsRightIcon className="h-4 w-4" />
              </PaginacaoBotao>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Mesmo componente local de registro-de-rondas/page.tsx -- ver o comentario
 * la sobre por que nao reaproveita a paginacao da DataTable. */
function PaginacaoBotao({
  children,
  disabled,
  href,
  ariaLabel,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  href?: string;
  ariaLabel: string;
}) {
  const className =
    "flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-brand-muted transition-all duration-200 hover:bg-brand-navy hover:text-white active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100";

  if (!href || disabled) {
    return (
      <button type="button" disabled aria-label={ariaLabel} className={className}>
        {children}
      </button>
    );
  }

  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  );
}
