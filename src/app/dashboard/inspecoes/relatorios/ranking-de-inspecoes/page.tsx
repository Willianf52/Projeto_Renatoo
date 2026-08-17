import { BarChart } from "@/components/dashboard/BarChart";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { BarChartIcon, FilterIcon, SearchIcon } from "@/components/dashboard/icons";
import { extrairFiltros, getOpcoesFiltros, getRankingDeInspecoes, type SearchParams } from "./queries";

/** "yyyy-mm-dd" -> "dd/mm/aaaa", como na referencia. */
function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default async function RankingDeInspecoesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [opcoes, ranking] = await Promise.all([getOpcoesFiltros(), getRankingDeInspecoes(filtros)]);

  const temPeriodo = Boolean(filtros.dataInicial && filtros.dataFinal);

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Inspeções" }, { label: "Relatórios" }, { label: "Ranking de Inspeções" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BarChartIcon className="h-4 w-4" />
            Ranking de Inspeções
          </h1>
        </div>

        {/* GET nativo, mesmo mecanismo das demais telas. Linha 1 com Data
            Inicial/Final estreitas + Checkpoint flexivel, linha 2 com o resto
            dos selects e o Filtrar como ultima celula -- como na referencia
            (Filtrar nao ocupa a linha inteira aqui, diferente do Registro de
            Rondas). */}
        <form method="get" className="space-y-3 border-b border-slate-800 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="w-full sm:w-44">
              <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
            </div>
            <div className="w-full sm:w-44">
              <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
            </div>
            <div className="min-w-0 flex-1">
              <FilterSelect
                label="Checkpoint"
                name="checkpoint"
                defaultValue={filtros.checkpoint}
                options={opcoes.checkpoints}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Funcionários"
              name="funcionario"
              defaultValue={filtros.funcionario}
              options={opcoes.funcionarios}
            />
            <FilterSelect
              label="Grupos Usuários"
              name="grupo_usuario"
              defaultValue={filtros.grupoUsuario}
              options={opcoes.gruposUsuarios}
            />
            <FilterSelect label="Tipo" name="tipo" defaultValue={filtros.tipo} options={opcoes.tipos} />
            <Button type="submit" className="group">
              <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
              Filtrar
            </Button>
          </div>
        </form>

        <div className="p-4">
          <div className="mb-4 text-center animate-fade-in-up">
            <h2 className="text-base font-semibold text-white">Ranking de Inspeções</h2>
            {temPeriodo && (
              <p className="mt-1 text-xs text-brand-muted">
                {formatarData(filtros.dataInicial!)} até {formatarData(filtros.dataFinal!)}
              </p>
            )}
            <p className="text-xs text-brand-muted">Total de Inspeções: {ranking.total}</p>
          </div>

          {ranking.itens.length === 0 ? (
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center animate-fade-in-up">
              <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
                <SearchIcon className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-white">Nenhuma inspeção encontrada</p>
              <p className="text-sm text-brand-muted">Ajuste o período ou os filtros acima para localizar registros.</p>
            </div>
          ) : (
            <div className="overflow-x-auto animate-fade-in-up" style={{ animationDelay: "80ms" }}>
              <BarChart
                itens={ranking.itens.map((item) => ({ nome: item.nome, valor: item.quantidade }))}
                tituloEixoY="Ranking de Inspeções"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
