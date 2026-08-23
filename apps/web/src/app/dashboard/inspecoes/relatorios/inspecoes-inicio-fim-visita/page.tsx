import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { ClipboardListIcon, ExcelIcon, FilterIcon, PdfIcon } from "@/components/dashboard/icons";
import {
  extrairFiltros,
  formatarData,
  formatarDuracao,
  formatarHora,
  getInspecoesComInicioEFim,
  getOpcoesFiltros,
  primeiro,
  TABLE_COLUMNS,
  type SearchParams,
} from "./queries";

const PAGE_SIZE = 25;

export default async function InspecoesInicioFimVisitaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);
  const pagina = Math.max(1, Number(primeiro(params.pagina)) || 1);

  const [opcoes, resultado] = await Promise.all([getOpcoesFiltros(), getInspecoesComInicioEFim(filtros)]);

  const totalItems = resultado?.linhas.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const linhasPagina = resultado?.linhas.slice((pagina - 1) * PAGE_SIZE, (pagina - 1) * PAGE_SIZE + PAGE_SIZE) ?? [];

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

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Inspeções" }, { label: "Relatórios" }, { label: "Inspeções com Início e Fim de Visita" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Relatório de Inspeções com Início e Fim de Visita
          </h1>
          {/* Ordem PDF/Excel invertida em relacao as demais telas -- assim
              na referencia. */}
          <div className="flex items-center gap-2">
            <Acao
              titulo="Exportar para PDF"
              href={`/dashboard/inspecoes/relatorios/inspecoes-inicio-fim-visita/export/pdf${queryExportacao}`}
              className="bg-red-600/40"
              target="_blank"
            >
              <PdfIcon className="h-4 w-4" />
            </Acao>
            <Acao
              titulo="Exportar para Excel"
              href={`/dashboard/inspecoes/relatorios/inspecoes-inicio-fim-visita/export/excel${queryExportacao}`}
              className="bg-emerald-600/40"
              target="_blank"
            >
              <ExcelIcon className="h-4 w-4" />
            </Acao>
          </div>
        </div>

        {/* GET nativo. Grade de 5 colunas na linha 1 (Data Inicial/Final +
            Eventos + Atividades + Motivos), 3 campos + Filtrar na linha 2
            (Funcionarios + Grupos Sites + Sites), como na referencia. */}
        <form method="get" className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
          <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
          <FilterSelect label="Eventos" name="evento" defaultValue={filtros.evento} options={opcoes.eventos} />
          <FilterSelect
            label="Atividades"
            name="atividade"
            defaultValue={filtros.atividade}
            options={opcoes.atividades}
          />
          <FilterSelect label="Motivos" name="motivo" defaultValue={filtros.motivo} options={opcoes.motivos} />

          <FilterSelect
            label="Funcionários"
            name="funcionario"
            defaultValue={filtros.funcionario}
            options={opcoes.funcionarios}
          />
          <FilterSelect
            label="Grupos Sites"
            name="grupo_site"
            defaultValue={filtros.grupoSite}
            options={opcoes.gruposSites}
          />
          <FilterSelect label="Sites" name="sites" defaultValue={filtros.sites} options={opcoes.sitesAgrupados} />

          <Button type="submit" className="group">
            <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
            Filtrar
          </Button>
        </form>

        {resultado?.truncado && (
          <p className="border-b border-slate-800 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
            Período com mais leituras do que o exibido — ajuste os filtros para reduzir o total.
          </p>
        )}

        {!resultado ? (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center animate-fade-in-up">
            <p className="text-sm font-medium text-white">Selecione um período</p>
            <p className="text-sm text-brand-muted">
              Escolha a Data Inicial e a Data Final acima e clique em Filtrar para ver as inspeções do período.
            </p>
          </div>
        ) : (
          <DataTable
            columns={TABLE_COLUMNS}
            rows={linhasPagina.map((linha) => [
              formatarData(linha.dataHoraInicio),
              formatarHora(linha.dataHoraInicio),
              formatarData(linha.dataHoraTermino),
              formatarHora(linha.dataHoraTermino),
              formatarDuracao(linha.duracaoMs),
              linha.usuario,
              linha.regional,
              linha.site,
              linha.evento,
            ])}
            page={pagina}
            totalPages={totalPages}
            totalItems={totalItems}
            buildPageHref={buildPageHref}
            emptyTitle="Nenhuma inspeção encontrada"
            emptyDescription="Ajuste o período ou os filtros acima para localizar registros."
          />
        )}
      </div>
    </div>
  );
}
