import { Button } from "@/components/Button";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { FilterIcon } from "@/components/dashboard/icons";
import { extrairFiltros, getOpcoesFiltros, SITUACOES_DO_MODELO, type SearchParams } from "./dados";

/**
 * A faixa de filtros dos tres relatorios, no desenho da referencia: datas,
 * "Respondido por" e o local na primeira linha; Checklist, situacao do
 * checklist e Filtrar na segunda. O Analitico filtra por Grupo de Sites, os
 * outros dois por Site -- como la. "Atividades" fica de fora: aqui atividade
 * e da leitura de QR, nao do checklist.
 */
export async function FiltrosDosRelatorios({
  searchParams,
  local,
}: {
  searchParams: Promise<SearchParams>;
  local: "grupo_site" | "site";
}) {
  const filtros = extrairFiltros(await searchParams, new Date());
  const opcoes = await getOpcoesFiltros();

  return (
    <form method="get" className="space-y-3 border-b border-slate-800 p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="w-full lg:w-44">
          <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
        </div>
        <div className="w-full lg:w-44">
          <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
        </div>
        <div className="min-w-0 flex-1">
          <FilterSelect label="Respondido por" name="usuario" defaultValue={filtros.usuario} options={opcoes.usuarios} />
        </div>
        <div className="min-w-0 flex-1">
          {local === "grupo_site" ? (
            <FilterSelect
              label="Grupo de Sites"
              name="grupo_site"
              defaultValue={filtros.grupoSite}
              options={opcoes.gruposSites}
            />
          ) : (
            <FilterSelect label="Sites" name="site" defaultValue={filtros.site} options={opcoes.sites} />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1">
          <FilterSelect label="Checklist" name="modelo" defaultValue={filtros.modelo} options={opcoes.modelos} />
        </div>
        <div className="w-full lg:w-64">
          <FilterSelect
            label="Situação do checklist"
            name="situacao"
            defaultValue={filtros.situacao}
            options={SITUACOES_DO_MODELO}
            semOpcaoVazia
          />
        </div>
        <Button type="submit" className="group w-full lg:w-40">
          <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
          Filtrar
        </Button>
      </div>
    </form>
  );
}
