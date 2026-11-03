import { paraCsv } from "@/lib/csv";

/**
 * "Arquivo de exemplo" do Importar Agendas: as colunas da planilha do sistema
 * de referencia, com tres linhas de mostra (diaria, semanal com tolerancia
 * em horas, e sem recorrencia). Os nomes sao ficticios.
 */
const COLUNAS = [
  "nome",
  "checklist(nome)",
  "data_planejada",
  "tolerancia(dias)",
  "responsavel(nome)",
  "grupo Usuários(nome)",
  "site(nome)",
  "padrao_recorrencia",
  "dias_uteis",
  "interrupção",
  "intervalo",
  "data termina",
  "dias/horas",
];

const LINHAS = [
  ["Agenda com recorrência diária", "Nome do Checklist", "01/12/2026", "2", "Nome do Responsável", "", "Site A;Site B", "1", "0", "0", "0", "31/12/2026", "D"],
  ["Agenda com recorrência semanal", "Nome do Checklist", "02/12/2026", "48", "", "Nome do Grupo", "Site C", "7", "0", "0", "0", "28/02/2027", "H"],
  ["Agenda sem recorrência", "Nome do Checklist", "10/12/2026", "2", "Nome do Responsável", "", "Site A", "0", "0", "0", "0", "", "D"],
];

export async function GET() {
  return new Response(paraCsv(COLUNAS, LINHAS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="exemplo_agendas.csv"',
    },
  });
}
