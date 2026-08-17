import { paraCsv } from "@/lib/csv";
import { colunasDeExportacao, extrairFiltros, getMapaDeLocaisInspecionados, paraLinhaDeExportacao } from "../../queries";

/**
 * "Exportar para Excel" desta tela: CSV com os mesmos filtros da listagem.
 * Sem Data Inicial/Final na querystring (tela nunca filtrada), exporta so o
 * cabecalho "Local"/"Total", sem dias -- mesmo estado vazio da tela.
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(Object.fromEntries(searchParams));

  const mapa = await getMapaDeLocaisInspecionados(filtros);
  const dias = mapa?.dias ?? [];
  const colunas = colunasDeExportacao(dias);
  const dados = (mapa?.linhas ?? []).map((linha) => paraLinhaDeExportacao(linha, dias));

  if (mapa?.diasExcedidos) {
    dados.push(["…", "Resultado truncado — ajuste o período para reduzir o total", ...Array(colunas.length - 2).fill("")]);
  }

  return new Response(paraCsv(colunas, dados), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mapa-de-locais-inspecionados.csv"',
    },
  });
}
