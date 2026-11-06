/**
 * O cabecalho de toda folha impressa do portal: o logo da Up no canto e o
 * titulo em negrito no centro, com uma linha de apoio opcional (periodo,
 * quantidade). Antes vivia so dentro de `TabelaImpressao`, e os PDFs que nao
 * sao tabela (o evento do Painel e os PDFs unificados) saiam sem o logo
 * (conferido em 05/11/2026).
 *
 * `img` e nao `next/image`: na impressao o que importa e o arquivo pronto
 * quando o dialogo abre, e o `ImprimirAoAbrir esperarImagens` espera por ele.
 * O arquivo do logo e branco, feito para o fundo escuro do portal, e no papel
 * sumia: inverter e girar o matiz deixa as letras pretas e as faixas na cor
 * original (30/10/2026).
 */
export function CabecalhoDaImpressao({
  titulo,
  apoio,
  maiusculas = false,
}: {
  titulo: string;
  apoio?: string | null;
  maiusculas?: boolean;
}) {
  return (
    <header className="relative mb-4 flex min-h-12 flex-col items-center justify-center px-24 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-up-servicos.png"
        alt="Up Serviços"
        className="absolute left-0 top-0 h-10 w-auto"
        style={{ filter: "invert(1) hue-rotate(180deg)" }}
      />
      <h1 className={`text-base font-bold ${maiusculas ? "uppercase" : ""}`}>{titulo}</h1>
      {apoio && <p className="text-xs font-bold">{apoio}</p>}
    </header>
  );
}
