import { paraCsv } from "@/lib/csv";
import { podeVerUsoDoPortal } from "@/lib/permissoes";
import { extrairFiltros, getUsoDoPortal, nomeDoArquivo, periodoValido, planilhaDoUso } from "../../queries";

/** "Exportar para Excel" do Uso do Portal: CSV com os mesmos filtros da tela. */
export async function GET(request: Request) {
  // A tela e so de quem acompanha o uso (0118, `layout.tsx`); rota de API nao
  // passa pelo layout. O RLS ja recortaria para o proprio uso, mas a planilha
  // nem deve existir para quem nao esta na lista.
  if (!(await podeVerUsoDoPortal())) {
    return new Response("Sem permissão.", { status: 403 });
  }

  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  if (!periodoValido(filtros)) {
    return new Response("Período inválido: até 366 dias, com a data final depois da inicial.", { status: 400 });
  }

  const { colunas, linhas } = planilhaDoUso(await getUsoDoPortal(filtros));

  return new Response(paraCsv(colunas, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeDoArquivo(filtros)}"`,
    },
  });
}
