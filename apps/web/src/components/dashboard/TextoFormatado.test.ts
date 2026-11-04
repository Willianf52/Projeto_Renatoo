import { describe, expect, it } from "vitest";
import { pedacosDaLinha } from "./TextoFormatado";

describe("pedacosDaLinha", () => {
  it("separa negrito e italico", () => {
    expect(pedacosDaLinha("Portaria **24h** com _ronda_")).toEqual([
      { texto: "Portaria ", negrito: false, italico: false },
      { texto: "24h", negrito: true, italico: false },
      { texto: " com ", negrito: false, italico: false },
      { texto: "ronda", negrito: false, italico: true },
    ]);
  });

  it("texto sem marca fica inteiro", () => {
    expect(pedacosDaLinha("sem marca")).toEqual([{ texto: "sem marca", negrito: false, italico: false }]);
  });
});
