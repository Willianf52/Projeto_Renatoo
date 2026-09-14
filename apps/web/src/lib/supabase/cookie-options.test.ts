import { DIAS_MAXIMOS_DE_SESSAO } from "@projeto-renatoo/shared";
import { describe, expect, it } from "vitest";
import { COOKIE_OPTIONS } from "./cookie-options";

describe("COOKIE_OPTIONS", () => {
  /**
   * O `maxAge` e escrito a mao em cookie-options.ts para nao puxar o pacote
   * compartilhado para o bundle do navegador. Este teste e o que impede os dois
   * prazos de divergirem: mudou `DIAS_MAXIMOS_DE_SESSAO`, o cookie acompanha.
   */
  it("o cookie dura o mesmo prazo que o middleware cobra", () => {
    expect(COOKIE_OPTIONS.maxAge).toBe(DIAS_MAXIMOS_DE_SESSAO * 24 * 60 * 60);
  });
});
