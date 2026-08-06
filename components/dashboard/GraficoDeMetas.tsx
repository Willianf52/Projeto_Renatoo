import type { MetaDoSite } from "@/app/dashboard/queries";

/**
 * "Visitas Realizadas x Não Realizadas" — o gráfico que a migration 0004
 * antecipou ao criar `metas_visitas`.
 *
 * Forma: uma barra-medidor por site. A pergunta é "quanto da meta cada site
 * cumpriu", que é uma razão contra um limite — não a identidade de duas
 * séries. Por isso **uma cor só** sobre um trilho do mesmo ramo, e não duas
 * cores disputando: o vazio é a ausência do cheio, não outra categoria. Uma
 * série só também dispensa caixa de legenda — o título já diz o que está
 * plotado.
 *
 * Cor: `#00a651` é o verde da marca (`--color-brand-green`, #00e676) descido
 * até a banda de luminosidade do modo escuro — o brand puro tem OKLCH L 0.81,
 * acima do teto de 0.67, e como preenchimento largo estoura. O trilho
 * `#10553a` é um passo mais escuro do mesmo ramo, a 2,19:1 da superfície:
 * visível como trilho sem competir com o dado. Os dois foram validados contra
 * a superfície `#0b0b26`, não escolhidos a olho.
 *
 * As barras não são coloridas por desempenho de propósito: pintar cada barra
 * conforme o próprio valor gastaria o canal de cor repetindo o que o
 * comprimento já mostra.
 *
 * Desenhado em HTML/CSS, não em SVG: as barras precisam acompanhar a largura
 * do contêiner e os rótulos precisam manter o tamanho de fonte. Num SVG
 * esticado por `preserveAspectRatio`, o texto esticaria junto.
 */

const PREENCHIMENTO = "#00a651";
const TRILHO = "#10553a";

function formatar(valor: number): string {
  return new Intl.NumberFormat("pt-BR").format(valor);
}

function percentual(meta: MetaDoSite): number {
  if (meta.esperadas === 0) return 0;
  return Math.round((meta.realizadas / meta.esperadas) * 100);
}

export function GraficoDeMetas({ metas }: { metas: MetaDoSite[] }) {
  /**
   * Escala absoluta, comum a todas as linhas: tanto o trilho (a meta) quanto o
   * preenchimento (o realizado) são medidos contra o maior valor da tabela.
   *
   * O denominador considera as duas colunas de propósito. Fosse só a maior
   * meta, um site que superou a dele desenharia uma barra mais larga que a
   * linha inteira.
   */
  const escala = Math.max(
    ...metas.map((meta) => Math.max(meta.esperadas, meta.realizadas)),
    1,
  );

  return (
    <ul className="space-y-1">
      {metas.map((meta) => {
        const pct = percentual(meta);
        const larguraDoTrilho = (meta.esperadas / escala) * 100;
        /**
         * Sem teto. Travar o preenchimento no trilho parecia proteger o
         * desenho e na verdade invertia a leitura: um site a 130% de uma meta
         * pequena aparecia com a barra mais curta que outro a 88% de uma meta
         * grande, contradizendo o próprio rótulo ao lado. Medidos os dois na
         * mesma escala absoluta, quem superou a meta ultrapassa o trilho --
         * que é o que "superou" quer dizer.
         */
        const larguraDoDado = (meta.realizadas / escala) * 100;

        return (
          <li
            key={meta.siteId}
            className="grid grid-cols-[minmax(0,1fr)] gap-1 py-1.5 sm:grid-cols-[minmax(7rem,14rem)_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
          >
            <span
              className="truncate text-xs font-medium text-white"
              title={`${meta.site} — ${meta.grupo}`}
            >
              {meta.site}
            </span>

            {/* `title` dá o tooltip nativo do navegador, com o mesmo conteúdo
                que os rótulos já mostram -- realce, nunca a única via até o
                número. */}
            <div
              className="relative h-3.5 w-full"
              title={`${meta.site}: ${formatar(meta.realizadas)} de ${formatar(meta.esperadas)} visitas (${pct}%)`}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-r"
                style={{ width: `${larguraDoTrilho}%`, backgroundColor: TRILHO }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-r"
                style={{ width: `${larguraDoDado}%`, backgroundColor: PREENCHIMENTO }}
              />
              {/* Marca da meta, em cor de superfície. Quando o preenchimento
                  ultrapassa o trilho ele cobriria a ponta dele, e o alvo --
                  a única referência que dá sentido ao comprimento -- sumiria
                  justamente nas linhas em que a notícia é boa. 2px na cor do
                  fundo é o mesmo mecanismo de separação usado entre marcas,
                  em vez de um contorno desenhado por cima do dado. */}
              {meta.esperadas > 0 && (
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 w-0.5 bg-brand-surface"
                  style={{ left: `calc(${larguraDoTrilho}% - 2px)` }}
                />
              )}
            </div>

            {/* Rótulo direto na ponta. `tabular-nums` aqui — e não nos
                indicadores do topo — porque estes números se alinham
                verticalmente uns com os outros. */}
            <span className="shrink-0 text-xs text-brand-muted tabular-nums">
              {formatar(meta.realizadas)}/{formatar(meta.esperadas)}
              <span className="ml-2 font-semibold text-white">{pct}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
