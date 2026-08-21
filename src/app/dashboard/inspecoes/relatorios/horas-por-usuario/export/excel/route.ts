import { paraCsv } from "@/lib/csv";
import { extrairFiltros, getHorasPorUsuario, paraLinhaDeExportacao, TABLE_COLUMNS } from "../../queries";

/** "Exportar para Excel" desta tela: CSV com os mesmos filtros da listagem. */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(Object.fromEntries(searchParams));

  const resultado = await getHorasPorUsuario(filtros);
  const dados = (resultado?.linhas ?? []).map(paraLinhaDeExportacao);

  // Mesma linha de aviso que o Mapa e o Registro de Rondas acrescentam: sem
  // ela a planilha sai com um total menor que o real e nada no arquivo diz
  // isso -- e um CSV circula muito depois da tela que o gerou.
  if (resultado?.truncado) {
    dados.push(["…", "Resultado truncado — reduza o período para ver as horas corretas", ...Array(TABLE_COLUMNS.length - 2).fill("")]);
  }

  return new Response(paraCsv(TABLE_COLUMNS, dados), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="horas-por-usuario.csv"',
    },
  });
}
