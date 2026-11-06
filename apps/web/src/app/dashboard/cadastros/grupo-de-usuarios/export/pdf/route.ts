import { avisoDeCorte, baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import { getGruposUsuariosParaExportar, toTableRow, COLUNAS_EXPORTACAO, LIMITE_EXPORTACAO } from "../../queries";

export async function GET(request: Request) {
  const { busca } = Object.fromEntries(new URL(request.url).searchParams);
  return baixarPdfDeTabela("Grupo_de_Usuarios.pdf", "Grupo de Usuários", async () => {
    const { rows, truncado } = await getGruposUsuariosParaExportar(busca);
    return {
      titulo: "Grupo de Usuários",
      colunas: COLUNAS_EXPORTACAO,
      linhas: rows.map(toTableRow),
      aviso: avisoDeCorte(truncado, LIMITE_EXPORTACAO),
    };
  });
}
