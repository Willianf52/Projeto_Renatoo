import { avisoDeCorte, baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import { getGruposSitesParaExportar, toTableRow, LIMITE_EXPORTACAO } from "../../queries";

const TABLE_COLUMNS = ["ID", "Nome", "Status", "Descrição"];

export async function GET(request: Request) {
  const { busca } = Object.fromEntries(new URL(request.url).searchParams);
  return baixarPdfDeTabela("Grupo_de_Sites.pdf", "Grupo de Sites", async () => {
    const { rows, truncado } = await getGruposSitesParaExportar(busca);
    return {
      titulo: "Grupo de Sites",
      colunas: TABLE_COLUMNS,
      linhas: rows.map(toTableRow),
      aviso: avisoDeCorte(truncado, LIMITE_EXPORTACAO),
    };
  });
}
