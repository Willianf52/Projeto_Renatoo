import { describe, expect, it } from "vitest";
import { texto } from "./form-data";

function formDataCom(valores: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [campo, valor] of Object.entries(valores)) formData.set(campo, valor);
  return formData;
}

describe("texto", () => {
  it("le o valor do campo", () => {
    expect(texto(formDataCom({ nome: "Portaria Norte" }), "nome")).toBe("Portaria Norte");
  });

  it("remove espaco das bordas", () => {
    expect(texto(formDataCom({ nome: "  Portaria Norte  " }), "nome")).toBe("Portaria Norte");
  });

  it("campo ausente vira string vazia, nao 'null' nem 'undefined'", () => {
    expect(texto(new FormData(), "nome")).toBe("");
  });
});
