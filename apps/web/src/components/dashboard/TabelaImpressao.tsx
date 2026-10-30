import { connection } from "next/server";
import { formatarEmissao } from "@/lib/data-hora";
import { ImprimirAoAbrir } from "./ImprimirAoAbrir";

/**
 * Tela usada pelos botoes de "Exportar para PDF": uma tabela em preto sobre
 * branco, sem a navegacao do dashboard (escondida via `print:hidden` em
 * `DashboardChrome`). `ImprimirAoAbrir` dispara o dialogo de impressao do
 * navegador assim que a pagina monta -- "Salvar como PDF" e uma das opcoes
 * desse dialogo em qualquer navegador atual.
 *
 * O layout copia o PDF do sistema antigo (Relatorio Coletor de Dados, lido em
 * 30/10/2026): logo no canto, titulo em maiusculas no centro com o periodo
 * embaixo, linhas zebradas e centralizadas, e no rodape de cada folha a data
 * de emissao e "N de M". O logo do rodape do antigo era o do fornecedor de
 * la, e por isso nao entra.
 */
export async function TabelaImpressao({
  titulo,
  colunas,
  linhas,
  truncado,
  limite,
  rodape,
  periodo,
}: {
  titulo: string;
  colunas: string[];
  linhas: string[][];
  truncado: boolean;
  limite: number;
  /**
   * Linha de resumo no pe, uma celula por coluna -- o "TOTAL:" de Registro de
   * Eventos. Separada de `linhas` para a zebra e a contagem tratarem so os
   * registros: um relatorio de tres sites nao tem quatro registros.
   */
  rodape?: string[];
  /** Datas do filtro em "yyyy-mm-dd", como `dataValida` devolve. */
  periodo?: { inicio?: string; fim?: string };
}) {
  const textoPeriodo = textoDoPeriodo(periodo?.inicio, periodo?.fim);
  // A emissao e a hora desta requisicao: com Cache Components, `new Date()`
  // so pode rodar depois de `connection()`, ou quebra o prerender no build.
  await connection();
  const emissao = formatarEmissao(new Date());

  return (
    <div
      data-paleta="original"
      className="bg-white p-6 text-black print:p-0"
      // Sem isto o navegador nao imprime fundo, e a zebra some no PDF.
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <style>{cssDaFolha(emissao)}</style>
      {/* Espera o logo carregar: imprimir antes deixaria o canto em branco. */}
      <ImprimirAoAbrir esperarImagens />

      <header className="relative mb-4 flex min-h-12 flex-col items-center justify-center text-center">
        {/* `img` e nao `next/image`: na impressao o que importa e o arquivo
            pronto quando o dialogo abre, e o `ImprimirAoAbrir` espera por ele. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-up-servicos.png" alt="Up Serviços" className="absolute left-0 top-0 h-10 w-auto" />
        <h1 className="text-base font-bold uppercase">{titulo}</h1>
        {textoPeriodo && <p className="text-xs font-bold">{textoPeriodo}</p>}
      </header>

      {truncado && (
        <p className="mb-2 text-center text-xs text-slate-600">
          Limitado aos primeiros {limite} registros. Ajuste os filtros para reduzir o total.
        </p>
      )}

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            {colunas.map((coluna) => (
              <th key={coluna} className="px-1 py-1 text-center font-bold uppercase">
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, indice) => (
            // Indice como key: linha nao tem id proprio disponivel aqui, e a
            // ordem e estavel dentro desta renderizacao unica (sem re-fetch
            // nem reordenacao no cliente).
            <tr key={indice} className={indice % 2 === 0 ? "bg-neutral-200" : undefined}>
              {linha.map((campo, coluna) => (
                <td key={coluna} className="px-1 py-0.5 text-center">
                  {campo}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {rodape && linhas.length > 0 && (
          <tfoot>
            <tr>
              {rodape.map((campo, coluna) => (
                <td key={coluna} className="border-t border-slate-400 px-1 py-1 text-center font-bold">
                  {campo}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/**
 * "PERÍODO: 30/10/2026 ATÉ 30/10/2026", como no cabecalho do antigo. Sem
 * nenhuma data, `null`: o relatorio sem filtro de periodo nao mostra a linha.
 */
export function textoDoPeriodo(inicio?: string, fim?: string): string | null {
  const br = (iso: string) => iso.split("-").reverse().join("/");
  if (inicio && fim) return `PERÍODO: ${br(inicio)} ATÉ ${br(fim)}`;
  if (inicio) return `PERÍODO: A PARTIR DE ${br(inicio)}`;
  if (fim) return `PERÍODO: ATÉ ${br(fim)}`;
  return null;
}

/**
 * Rodape de cada folha impressa: a emissao a esquerda e "N de M" no centro.
 * Vai nas caixas de margem do `@page` (Chrome 131+), o unico lugar em que o
 * navegador sabe o numero da pagina. Sem `size`: a orientacao continua sendo
 * escolha de quem imprime, e relatorio largo sai melhor deitado.
 */
export function cssDaFolha(emissao: string): string {
  const texto = emissao.replace(/["\\]/g, "\\$&").replace(/[\r\n]+/g, " ");
  const fonte = "font: 8px sans-serif; color: #333;";
  return `@page { margin: 12mm 10mm 16mm 10mm; @bottom-left { content: "${texto}"; ${fonte} } @bottom-center { content: counter(page) " de " counter(pages); ${fonte} } }`;
}
