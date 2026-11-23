import { formatarDataHora } from "@/lib/data-hora";
import { baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import { rotuloDoStatus } from "../../../agendas/regras";
import { extrairFiltros, getAgendamentos } from "../../queries";

const COLUNAS = ["Data Planejada", "Prazo", "Agenda", "Checklist", "Site", "Responsável", "Status", "Realizado em"];

const data = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/**
 * "Exportar para PDF" dos Agendamentos (11/11/2026), como no sistema de
 * referencia: o periodo que esta no calendario (a tela manda `data_inicial`
 * e `data_final`) com os mesmos filtros, baixando direto.
 */
export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams), new Date());
  return baixarPdfDeTabela("Agendamentos.pdf", "Agendamentos", async () => {
    const agendamentos = await getAgendamentos(filtros);
    return {
      titulo: "Agendamentos",
      apoio: `PERÍODO: ${data(filtros.dataInicial)} a ${data(filtros.dataFinal)}`,
      colunas: COLUNAS,
      linhas: agendamentos.map((a) => [
        data(a.dataPlanejada),
        data(a.prazo),
        a.agenda,
        a.modelo,
        a.site,
        a.responsavel,
        rotuloDoStatus(a.status),
        formatarDataHora(a.realizadoEm),
      ]),
      paisagem: true,
    };
  });
}
