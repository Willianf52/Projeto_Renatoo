import { ImprimirAoAbrir } from "./ImprimirAoAbrir";

/**
 * Tela usada pelos botoes de "Exportar para PDF": uma tabela simples, em
 * preto sobre branco, sem a navegacao do dashboard (escondida via
 * `print:hidden` em `DashboardChrome`). `ImprimirAoAbrir` dispara o dialogo
 * de impressao do navegador assim que a pagina monta -- "Salvar como PDF" e
 * uma das opcoes desse dialogo em qualquer navegador atual.
 */
export function TabelaImpressao({
  titulo,
  colunas,
  linhas,
  truncado,
  limite,
}: {
  titulo: string;
  colunas: string[];
  linhas: string[][];
  truncado: boolean;
  limite: number;
}) {
  return (
    <div className="bg-white p-6 text-black">
      <ImprimirAoAbrir />

      <h1 className="mb-1 text-lg font-semibold">{titulo}</h1>
      <p className="mb-4 text-xs text-slate-600">
        {linhas.length} {linhas.length === 1 ? "registro" : "registros"}
        {truncado && ` — limitado aos primeiros ${limite}, ajuste os filtros para reduzir o total`}
      </p>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {colunas.map((coluna) => (
              <th
                key={coluna}
                className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold"
              >
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
            <tr key={indice}>
              {linha.map((campo, coluna) => (
                <td key={coluna} className="border border-slate-300 px-2 py-1">
                  {campo}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
