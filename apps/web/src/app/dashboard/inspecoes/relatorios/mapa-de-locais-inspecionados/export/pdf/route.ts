import { baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import {
  colunasDeExportacao,
  extrairFiltros,
  getMapaDeLocaisInspecionados,
  paraLinhaDeExportacao,
} from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("Mapa_de_Locais_Inspecionados.pdf", "Mapa de Locais Inspecionados", async () => {
    const mapa = await getMapaDeLocaisInspecionados(filtros);
    const dias = mapa?.dias ?? [];
    return {
      titulo: "Mapa de Quantidade de Locais Inspecionados",
      colunas: colunasDeExportacao(dias),
      linhas: (mapa?.linhas ?? []).map((linha) => paraLinhaDeExportacao(linha, dias)),
      aviso: mapa?.diasExcedidos ? "Resultado truncado: ajuste o período para reduzir o total." : null,
      paisagem: true,
    };
  });
}
