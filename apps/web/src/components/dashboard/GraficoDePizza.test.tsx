// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GraficoDePizza, type FatiaDaPizza } from "./GraficoDePizza";

function renderizar(fatias: FatiaDaPizza[]) {
  const html = renderToStaticMarkup(
    <GraficoDePizza
      id="g"
      titulo="Eventos"
      subtitulos={["01/09/2026 até 18/09/2026", "Total de Eventos: 59"]}
      fatias={fatias}
    />,
  );
  const doc = new DOMParser().parseFromString(html, "image/svg+xml");
  return { html, doc };
}

describe("GraficoDePizza", () => {
  it("tem titulo e subtitulos dentro do SVG, para a imagem exportada sair completa", () => {
    const { html } = renderizar([{ rotulo: "RH", valor: 24, cor: "#3987e5" }]);
    for (const texto of ["Eventos", "01/09/2026 até 18/09/2026", "Total de Eventos: 59"]) {
      expect(html).toContain(texto);
    }
  });

  it("escreve o percentual de cada fatia sobre o total", () => {
    const { html } = renderizar([
      { rotulo: "RH", valor: 24, cor: "#3987e5" },
      { rotulo: "PORTARIA", valor: 11, cor: "#d95926" },
      { rotulo: "LIMPEZA", valor: 24, cor: "#199e70" },
    ]);

    // 24/59, 11/59 -- os mesmos numeros do print da referencia.
    expect(html).toContain("40.7%");
    expect(html).toContain("18.6%");
  });

  it("uma fatia sozinha vira circulo cheio, e nao um arco de 360 graus que some", () => {
    const { doc } = renderizar([{ rotulo: "RH", valor: 5, cor: "#3987e5" }]);

    expect(doc.querySelectorAll("path")).toHaveLength(0);
    const circulos = Array.from(doc.querySelectorAll("circle"));
    expect(circulos).toHaveLength(1);
    expect(circulos[0].getAttribute("fill")).toBe("#3987e5");
  });

  it("sem fatia nenhuma desenha so o circulo vazio, como a referencia abre", () => {
    const { doc, html } = renderizar([]);

    expect(doc.querySelectorAll("path")).toHaveLength(0);
    expect(doc.querySelector("circle")?.getAttribute("fill")).toBe("none");
    // O cabecalho continua la, com o periodo em branco.
    expect(html).toContain("Total de Eventos: 59");
  });

  it("separa rotulos vizinhos que cairiam um por cima do outro", () => {
    // Tres fatias minusculas seguidas caem quase no mesmo y do mesmo lado.
    const { doc } = renderizar([
      { rotulo: "GRANDE", valor: 200, cor: "#3987e5" },
      { rotulo: "A", valor: 1, cor: "#d95926" },
      { rotulo: "B", valor: 1, cor: "#199e70" },
      { rotulo: "C", valor: 1, cor: "#c98500" },
    ]);

    const ys = Array.from(doc.querySelectorAll("polyline")).map((guia) => {
      const pontos = guia.getAttribute("points")!.split(" ");
      return Number(pontos[pontos.length - 1].split(",")[1]);
    });
    const ordenados = [...ys].sort((a, b) => a - b);

    for (let i = 1; i < ordenados.length; i++) {
      expect(ordenados[i] - ordenados[i - 1]).toBeGreaterThanOrEqual(29);
    }
  });

  it("o texto do rotulo nao usa a cor da fatia", () => {
    const { doc } = renderizar([
      { rotulo: "RH", valor: 5, cor: "#3987e5" },
      { rotulo: "EPI", valor: 5, cor: "#d95926" },
    ]);

    const coresDosTextos = Array.from(doc.querySelectorAll("text")).map((texto) => texto.getAttribute("fill"));
    expect(coresDosTextos).not.toContain("#3987e5");
    expect(coresDosTextos).not.toContain("#d95926");
  });
});
