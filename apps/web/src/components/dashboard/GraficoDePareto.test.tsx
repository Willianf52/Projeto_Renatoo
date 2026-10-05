import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GraficoDePareto, tetoDoPercentual } from "./GraficoDePareto";

describe("tetoDoPercentual", () => {
  it("proximo multiplo de 6 acima do maior valor (26,24 -> 30, como a referencia)", () => {
    expect(tetoDoPercentual(26.24)).toBe(30);
    expect(tetoDoPercentual(30)).toBe(30);
    expect(tetoDoPercentual(30.01)).toBe(36);
  });

  it("nunca abaixo de 6, nem com tudo zerado", () => {
    expect(tetoDoPercentual(0)).toBe(6);
  });
});

describe("GraficoDePareto", () => {
  const itens = [
    { rotulo: "RH", quantidade: 207, percentual: 26.24 },
    { rotulo: "LIMPEZA", quantidade: 176, percentual: 22.31 },
  ];

  it("desenha uma coluna e um ponto por item, com a linha ligando os pontos", () => {
    const html = renderToStaticMarkup(
      <GraficoDePareto id="g" titulo="Ranking" subtitulos={["01/01/2026 até 05/10/2026", "Total Geral: 789"]} itens={itens} />,
    );
    expect(html.match(/<rect /g)).toHaveLength(1 + itens.length);
    expect(html.match(/<circle /g)).toHaveLength(itens.length);
    expect(html).toContain("<polyline");
    expect(html).toContain("RH: 207 (26,24%)");
    expect(html).toContain("Total Geral: 789");
  });

  it("um item so nao desenha linha, e sem itens desenha so o cabecalho", () => {
    const um = renderToStaticMarkup(<GraficoDePareto id="g" titulo="R" subtitulos={[]} itens={[itens[0]]} />);
    expect(um).not.toContain("<polyline");

    const vazio = renderToStaticMarkup(<GraficoDePareto id="g" titulo="R" subtitulos={["a", "b"]} itens={[]} />);
    expect(vazio).toContain("<svg");
    expect(vazio).not.toContain("<circle");
  });
});
