import { describe, expect, it } from "vitest";

import { eLimiteDeEnvioDoProjeto, INTERVALO_DE_REENVIO_EM_SEGUNDOS, rotuloDoReenvio } from "./recuperacao-de-senha";

describe("eLimiteDeEnvioDoProjeto", () => {
  it("so o limite de envio do projeto conta", () => {
    expect(eLimiteDeEnvioDoProjeto({ code: "over_email_send_rate_limit" })).toBe(true);
  });

  it("o limite por usuario nao conta: revelaria que o e-mail existe", () => {
    expect(eLimiteDeEnvioDoProjeto({ code: "over_request_rate_limit" })).toBe(false);
  });

  it("sem erro ou com outro erro, nao", () => {
    expect(eLimiteDeEnvioDoProjeto(null)).toBe(false);
    expect(eLimiteDeEnvioDoProjeto(undefined)).toBe(false);
    expect(eLimiteDeEnvioDoProjeto({})).toBe(false);
    expect(eLimiteDeEnvioDoProjeto({ code: "unexpected_failure" })).toBe(false);
  });
});

// Pedido do dono (23/10/2026): "Reenviar e-mail" com 60 s de intervalo.
describe("rotuloDoReenvio", () => {
  it("travado, mostra a contagem; aos 0 s, libera", () => {
    expect(INTERVALO_DE_REENVIO_EM_SEGUNDOS).toBe(60);
    expect(rotuloDoReenvio(INTERVALO_DE_REENVIO_EM_SEGUNDOS, false)).toBe("Reenviar em 60 s");
    expect(rotuloDoReenvio(1, false)).toBe("Reenviar em 1 s");
    expect(rotuloDoReenvio(0, false)).toBe("Reenviar e-mail");
  });

  it("enviando, avisa o envio em vez da contagem", () => {
    expect(rotuloDoReenvio(0, true)).toBe("Reenviando...");
  });
});
