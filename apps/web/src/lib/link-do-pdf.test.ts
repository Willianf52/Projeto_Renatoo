import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { assinarLinkDoPdf, chaveDoLink, lerLinkDoPdf, VALIDADE_DO_LINK_MS } = await import("./link-do-pdf");

const chave = chaveDoLink("service-role-de-teste");
const agora = Date.UTC(2026, 10, 18, 12, 0, 0);

describe("link assinado do PDF do checklist", () => {
  it("devolve o checklist do link recem-assinado", () => {
    const token = assinarLinkDoPdf(42, chave, agora);
    expect(lerLinkDoPdf(token, chave, agora + 1000)).toBe(42);
  });

  it("recusa o link vencido", () => {
    const token = assinarLinkDoPdf(42, chave, agora);
    expect(lerLinkDoPdf(token, chave, agora + VALIDADE_DO_LINK_MS + 1)).toBeNull();
  });

  it("recusa o link com o numero do checklist trocado", () => {
    const [, expira, assinatura] = assinarLinkDoPdf(42, chave, agora).split(".");
    expect(lerLinkDoPdf(`43.${expira}.${assinatura}`, chave, agora)).toBeNull();
  });

  it("recusa a validade esticada", () => {
    const [id, , assinatura] = assinarLinkDoPdf(42, chave, agora).split(".");
    expect(lerLinkDoPdf(`${id}.${agora + 10 * VALIDADE_DO_LINK_MS}.${assinatura}`, chave, agora)).toBeNull();
  });

  it("recusa o link assinado com outra chave", () => {
    const token = assinarLinkDoPdf(42, chaveDoLink("outra-service-role"), agora);
    expect(lerLinkDoPdf(token, chave, agora)).toBeNull();
  });

  it("recusa formato quebrado", () => {
    expect(lerLinkDoPdf("", chave, agora)).toBeNull();
    expect(lerLinkDoPdf("42", chave, agora)).toBeNull();
    expect(lerLinkDoPdf("abc.def.ghi", chave, agora)).toBeNull();
    expect(lerLinkDoPdf("42.1.2.3", chave, agora)).toBeNull();
  });
});
