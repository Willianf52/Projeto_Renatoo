import { describe, expect, it } from "vitest";
import { lerListaDeEmails } from "./lista-de-emails";

describe("lerListaDeEmails", () => {
  it("separa por vírgula, ponto e vírgula, espaço e linha; minúsculas e sem repetidos", () => {
    expect(lerListaDeEmails("A@x.com; b@y.com,\na@x.com  c@z.com", 5, "e-mails")).toEqual({
      ok: true,
      emails: ["a@x.com", "b@y.com", "c@z.com"],
    });
  });

  it("vazio é lista vazia", () => {
    expect(lerListaDeEmails("  ", 5, "e-mails")).toEqual({ ok: true, emails: [] });
  });

  it("aponta o primeiro inválido", () => {
    expect(lerListaDeEmails("a@x.com, errado", 5, "e-mails")).toEqual({ ok: false, erro: "E-mail inválido: errado" });
  });

  it("respeita o teto com o rótulo dado", () => {
    expect(lerListaDeEmails("a@x.com b@x.com c@x.com", 2, "e-mails de eventos")).toEqual({
      ok: false,
      erro: "No máximo 2 e-mails de eventos.",
    });
  });
});
