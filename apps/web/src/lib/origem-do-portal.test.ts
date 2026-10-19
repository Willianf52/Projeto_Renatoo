import { describe, expect, it } from "vitest";
import { origemDoPortal } from "./origem-do-portal";

const CHAMADA_PELO_VAULT = "https://projeto-renatoo-x.vercel.app/api/webhooks/ocorrencia-emails";

describe("origemDoPortal", () => {
  it("usa o dominio de producao, e nao o endereco de quem chamou (ensaio de 19/10)", () => {
    expect(origemDoPortal(CHAMADA_PELO_VAULT, "portalupservicos.com.br")).toBe("https://portalupservicos.com.br");
  });

  it("aceita o valor com protocolo ou barra no fim", () => {
    expect(origemDoPortal(CHAMADA_PELO_VAULT, "https://portalupservicos.com.br/")).toBe(
      "https://portalupservicos.com.br",
    );
  });

  it("sem a variavel (local, testes), vale o endereco de quem chamou", () => {
    expect(origemDoPortal("http://localhost:3000/api/cron/enviar-emails-de-ocorrencia", undefined)).toBe(
      "http://localhost:3000",
    );
    expect(origemDoPortal("http://localhost:3000/x", "  ")).toBe("http://localhost:3000");
  });

  it("valor que nao e nome de host nao vira link", () => {
    expect(origemDoPortal(CHAMADA_PELO_VAULT, "evil.test/caminho?x=1")).toBe("https://projeto-renatoo-x.vercel.app");
    expect(origemDoPortal(CHAMADA_PELO_VAULT, "javascript:alert(1)")).toBe("https://projeto-renatoo-x.vercel.app");
  });
});
