import { describe, expect, it } from "vitest";
import { filtroDeId, filtroDeUuid, idNaUrl } from "./id-na-url";

describe("idNaUrl", () => {
  it("aceita inteiro positivo", () => {
    expect(idNaUrl("42")).toBe(42);
  });

  it("recusa o numero que estoura o bigint -- o defeito achado no Historico", () => {
    expect(idNaUrl("99999999999999999999")).toBeNull();
  });

  it.each(["abc", "", "0", "-5", "1e3", "0x10", " 7", "7.0", "7 "])("recusa %j", (valor) => {
    expect(idNaUrl(valor)).toBeNull();
  });

  it("recusa ausente", () => {
    expect(idNaUrl(undefined)).toBeNull();
  });
});

describe("filtroDeId", () => {
  it("mantem o valor valido como texto", () => {
    expect(filtroDeId("7")).toBe("7");
  });

  it("descarta o invalido", () => {
    expect(filtroDeId("abc")).toBeUndefined();
  });
});

describe("filtroDeUuid", () => {
  it("mantem uuid valido", () => {
    expect(filtroDeUuid("e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3")).toBe("e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3");
  });

  it.each(["nao-uuid", "e75fb18e35e44a7f82ec7ec3b2fed0a3", "7"])("descarta %j", (valor) => {
    expect(filtroDeUuid(valor)).toBeUndefined();
  });
});
