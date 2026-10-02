import { describe, expect, it } from "vitest";

import { eLimiteDeEnvioDoProjeto } from "./recuperacao-de-senha";

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
