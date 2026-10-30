import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { ExcelIcon } from "@/components/dashboard/icons";
import {
  comPadroesDaTela,
  extrairFiltros,
  getHistorico,
  modelosDoHistorico,
  querystringDe,
  type SearchParams,
} from "../../queries";

const LISTAGEM = "/dashboard/checklistlab/historico-de-checklist";

/**
 * Onde se escolhe a planilha de respostas, como a caixa que o antigo abre no
 * "Exportar Respostas para Excel": cada modelo de checklist tem perguntas
 * proprias, entao sai um arquivo por modelo. Lista os modelos que aparecem no
 * filtro da tela, cada um com o link da sua planilha.
 *
 * Abre em aba nova, como as demais exportacoes; espera a consulta antes de
 * renderizar, entao `instant = false` (ver `../pdf/page.tsx`).
 */
export const instant = false;

export default async function EscolherModeloPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = comPadroesDaTela(await searchParams);
  const filtros = extrairFiltros(params);
  const historico = await getHistorico(filtros);
  const modelos = modelosDoHistorico(historico.linhas);
  const query = querystringDe(params, ["pagina", "salvo", "modelo"]);

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: "ChecklistLab" },
          { label: "Histórico de Checklist", href: LISTAGEM },
          { label: "Exportar Respostas" },
        ]}
      />

      <div className="overflow-hidden rounded-lg bg-brand-surface shadow-sm">
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="text-sm font-semibold text-white">Exportar Respostas para Excel</h1>
          <p className="mt-1 text-xs text-slate-400">
            Escolha o checklist. Cada um sai numa planilha, com as perguntas em colunas.
          </p>
        </div>

        {modelos.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400">
            Nenhum checklist com perguntas no filtro atual. Volte e ajuste o período ou os filtros.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {modelos.map((modelo) => (
              <li key={modelo.id}>
                <a
                  href={`${LISTAGEM}/export/respostas?${query ? `${query}&` : ""}modelo=${modelo.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-white transition-colors hover:bg-slate-800/60"
                >
                  <span className="flex items-center gap-2">
                    <ExcelIcon className="h-4 w-4 shrink-0" />
                    {modelo.nome}
                  </span>
                  <span className="text-xs text-slate-400">
                    {modelo.total} {modelo.total === 1 ? "checklist" : "checklists"}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
