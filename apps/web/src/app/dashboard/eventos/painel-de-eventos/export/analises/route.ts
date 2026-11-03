import { paraCsv } from "@/lib/csv";
import { formatarDataHora } from "@/lib/data-hora";
import { extrairFiltros, getAnalisesDoFiltro } from "../../queries";

const COLUNAS = [
  "Número / Ano",
  "Site",
  "Evento",
  "Status do Evento",
  "Data / Hora",
  "Tipo",
  "Tipo de Análise",
  "Classificação",
  "Usuário",
  "Responsável",
  "Grupo de Usuários",
  "Análise / Ações realizadas",
];

/**
 * "Exportar Analises" do Painel de Eventos: uma linha por analise ou
 * finalizacao registrada nos eventos do filtro. O sistema de referencia gera
 * .xlsx; aqui sai CSV, como todo "Excel" do portal (ver `lib/csv.ts`), que o
 * Excel abre do mesmo jeito.
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filtros = extrairFiltros(params, new Date());
  const { analises } = await getAnalisesDoFiltro(filtros);

  const linhas = analises.map((a) => [
    a.numeroAno,
    a.site,
    a.evento,
    a.status,
    formatarDataHora(a.criadoEm),
    a.tipo,
    a.tipoDeAnalise,
    a.classificacao,
    a.autor,
    a.responsavel,
    a.grupo,
    a.texto,
  ]);

  return new Response(paraCsv(COLUNAS, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="analises-dos-eventos.csv"',
    },
  });
}
