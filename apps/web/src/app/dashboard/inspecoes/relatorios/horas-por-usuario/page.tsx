import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { ClipboardListIcon, ExcelIcon, FilterIcon, PdfIcon } from "@/components/dashboard/icons";
import {
  extrairFiltros,
  formatarDuracao,
  formatarMedia,
  getHorasPorUsuario,
  getOpcoesFiltros,
  primeiro,
  TABLE_COLUMNS,
  type SearchParams,
} from "./queries";

export default async function HorasPorUsuarioPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [opcoes, resultado] = await Promise.all([getOpcoesFiltros(), getHorasPorUsuario(filtros)]);

  const queryExportacao = (() => {
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      const v = primeiro(valor);
      if (v) query.set(chave, v);
    }
    const texto = query.toString();
    return texto ? `?${texto}` : "";
  })();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Inspeções" }, { label: "Relatórios" }, { label: "Quantidade de Horas por Usuário" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Quantidade de Horas por Usuário
          </h1>
          <div className="flex items-center gap-2">
            <Acao
              titulo="Exportar para Excel"
              href={`/dashboard/inspecoes/relatorios/horas-por-usuario/export/excel${queryExportacao}`}
              className="bg-emerald-600/40"
              target="_blank"
            >
              <ExcelIcon className="h-4 w-4" />
            </Acao>
            <Acao
              titulo="Exportar para PDF"
              href={`/dashboard/inspecoes/relatorios/horas-por-usuario/export/pdf${queryExportacao}`}
              className="bg-red-600/40"
              target="_blank"
            >
              <PdfIcon className="h-4 w-4" />
            </Acao>
          </div>
        </div>

        {/* GET nativo. Grade de 5 colunas (Data Inicial/Final + Coletor +
            Funcionarios + Checkpoint na linha 1, Grupos Usuarios + Sites +
            Local na linha 2 + Filtrar), como na referencia. */}
        <form method="get" className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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

          <FilterSelect
            label="Grupos Usuários"
            name="grupo_usuario"
            defaultValue={filtros.grupoUsuario}
            options={opcoes.gruposUsuarios}
          />
          <FilterSelect label="Sites" name="sites" defaultValue={filtros.sites} options={opcoes.sitesAgrupados} />
          <FilterSelect label="Local" name="local" defaultValue={filtros.local} options={opcoes.locais} />

          <Button type="submit" className="group">
            <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
            Filtrar
          </Button>
        </form>

        {resultado?.truncado && (
          <p className="border-b border-slate-800 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
            Período com mais leituras do que o suportado — os totais abaixo estão incompletos. Reduza o período para
            ver as horas corretas.
          </p>
        )}

        {!resultado ? (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center animate-fade-in-up">
            <p className="text-sm font-medium text-white">Selecione um período</p>
            <p className="text-sm text-brand-muted">
              Escolha a Data Inicial e a Data Final acima e clique em Filtrar para ver as horas por usuário.
            </p>
          </div>
        ) : (
          <DataTable
            columns={TABLE_COLUMNS}
            rows={resultado.linhas.map((linha) => [
              linha.nome,
              formatarDuracao(linha.totalMs),
              formatarMedia(linha.totalMs, linha.visitas),
              String(linha.visitas),
            ])}
            page={1}
            totalPages={resultado.linhas.length > 0 ? 1 : 0}
            totalItems={resultado.linhas.length}
            emptyTitle="Nenhum usuário encontrado"
            emptyDescription="Ajuste os filtros acima para localizar registros."
          />
        )}
      </div>
    </div>
  );
}
