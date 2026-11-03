import { paraCsv } from "@/lib/csv";
import { formatarDataHora } from "@/lib/data-hora";
import { rotuloDoStatus } from "../../../agendas/regras";
import { extrairFiltros, getAgendamentos } from "../../queries";

const COLUNAS = ["Data Planejada", "Prazo", "Agenda", "Checklist", "Site", "Responsável", "Status", "Realizado em"];

const data = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/** "Exportar para Excel" dos Agendamentos: CSV com o filtro inteiro. */
export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams), new Date());
  const agendamentos = await getAgendamentos(filtros);

  const linhas = agendamentos.map((a) => [
    data(a.dataPlanejada),
    data(a.prazo),
    a.agenda,
    a.modelo,
    a.site,
    a.responsavel,
    rotuloDoStatus(a.status),
    formatarDataHora(a.realizadoEm),
  ]);

  return new Response(paraCsv(COLUNAS, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="agendamentos.csv"',
    },
  });
}
