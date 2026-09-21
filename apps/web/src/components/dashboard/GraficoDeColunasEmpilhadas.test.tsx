// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GraficoDeColunasEmpilhadas } from "./GraficoDeColunasEmpilhadas";

function renderizar(valoresA: number[], valoresB: number[]) {
  const html = renderToStaticMarkup(
    <GraficoDeColunasEmpilhadas
      id="g"
      titulo="Eventos por Site"
      subtitulos={["01/09/2026 até 18/09/2026", "Total de Eventos: 9"]}
      categorias={valoresA.map((_, i) => ({ rotulo: `Site ${i}`, dica: `UP Serviços > Site ${i}` }))}
      series={[
        { nome: "Aguardando", cor: "#dc2626", valores: valoresA },
        { nome: "Em análise", cor: "#eab308", valores: valoresB },
      ]}
      tituloEixoY="Quantidade"
    />,
  );
  const doc = new DOMParser().parseFromString(html, "image/svg+xml");
  return { html, doc };
}

describe("GraficoDeColunasEmpilhadas", () => {
  it("tem titulo, subtitulos, legenda completa e eixo Y dentro do SVG", () => {
    const { html } = renderizar([4, 1], [1, 0]);
    for (const texto of ["Eventos por Site", "01/09/2026 até 18/09/2026", "Total de Eventos: 9", "Aguardando", "Em análise", "Quantidade"]) {
      expect(html).toContain(texto);
    }
  });

  it("empilha os pedacos: o de cima comeca onde o de baixo termina", () => {
    const { doc } = renderizar([4, 1], [1, 0]);
    // O primeiro rect e o fundo; depois vem os pedacos das colunas.
    const [, aguardando, emAnalise] = Array.from(doc.querySelectorAll("rect"));
    const topoDoAguardando = Number(aguardando.getAttribute("y"));
    const baseDoEmAnalise = Number(emAnalise.getAttribute("y")) + Number(emAnalise.getAttribute("height"));
    expect(baseDoEmAnalise).toBeCloseTo(topoDoAguardando);
    expect(aguardando.getAttribute("fill")).toBe("#dc2626");
    expect(emAnalise.getAttribute("fill")).toBe("#eab308");
  });

  it("nao desenha pedaco de valor zero", () => {
    const { doc } = renderizar([4, 1], [1, 0]);
    // fundo + 2 pedacos da primeira coluna + 1 da segunda
    expect(doc.querySelectorAll("rect")).toHaveLength(4);
  });

  it("corta rotulo longo com reticencias e guarda o nome inteiro no tooltip", () => {
    const html = renderToStaticMarkup(
      <GraficoDeColunasEmpilhadas
        id="g"
        titulo="t"
        subtitulos={[]}
        categorias={[{ rotulo: "SICREDI - ITAQUAQUECETUBA CENTRO", dica: "UP Serviços > SIC > SICREDI - ITAQUAQUECETUBA CENTRO" }]}
        series={[{ nome: "Aguardando", cor: "#dc2626", valores: [1] }]}
        tituloEixoY="Quantidade"
      />,
    );
    // 24 caracteres contando as reticencias.
    expect(html).toContain("SICREDI - ITAQUAQUECETU…");
    expect(html).toContain("UP Serviços &gt; SIC &gt; SICREDI - ITAQUAQUECETUBA CENTRO: 1");
  });
});
