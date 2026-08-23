import { describe, expect, it } from "vitest";
import {
  isEventoRelevante,
  isSenhaAlterada,
  lerPayload,
  segredoConfere,
} from "./webhook-user-updated";

const usuario = (extra: Record<string, unknown> = {}) => ({
  id: "11111111-1111-1111-1111-111111111111",
  email: "pessoa@empresa.com",
  encrypted_password: "hash-antigo",
  ...extra,
});

const payloadValido = (extra: Record<string, unknown> = {}) => ({
  type: "UPDATE",
  table: "users",
  schema: "auth",
  record: usuario({ encrypted_password: "hash-novo" }),
  old_record: usuario(),
  ...extra,
});

describe("segredoConfere", () => {
  it("aceita o segredo correto", () => {
    expect(segredoConfere("s3gr3d0", "s3gr3d0")).toBe(true);
  });

  it("rejeita segredo errado do mesmo tamanho", () => {
    expect(segredoConfere("s3gr3d1", "s3gr3d0")).toBe(false);
  });

  it("rejeita segredo de tamanho diferente sem lancar excecao", () => {
    // timingSafeEqual exige buffers iguais; o sha256 normaliza o tamanho.
    expect(() => segredoConfere("curto", "muito-mais-longo-que-o-outro")).not.toThrow();
    expect(segredoConfere("curto", "muito-mais-longo-que-o-outro")).toBe(false);
  });

  it("rejeita header ausente", () => {
    expect(segredoConfere(null, "s3gr3d0")).toBe(false);
    expect(segredoConfere(undefined, "s3gr3d0")).toBe(false);
    expect(segredoConfere("", "s3gr3d0")).toBe(false);
  });
});

describe("lerPayload", () => {
  it("aceita um payload completo", () => {
    expect(lerPayload(payloadValido())).not.toBeNull();
  });

  it("rejeita valores que nao sao objeto", () => {
    expect(lerPayload(null)).toBeNull();
    expect(lerPayload("texto")).toBeNull();
    expect(lerPayload(42)).toBeNull();
    expect(lerPayload([])).toBeNull();
  });

  it("rejeita payload sem record", () => {
    expect(lerPayload(payloadValido({ record: undefined }))).toBeNull();
    expect(lerPayload(payloadValido({ record: null }))).toBeNull();
  });

  it("rejeita e-mail fora de formato", () => {
    expect(lerPayload(payloadValido({ record: usuario({ email: "sem-arroba" }) }))).toBeNull();
    expect(lerPayload(payloadValido({ record: usuario({ email: "a@b" }) }))).toBeNull();
    expect(lerPayload(payloadValido({ record: usuario({ email: "" }) }))).toBeNull();
  });

  it("rejeita e-mail acima do limite de 254 caracteres", () => {
    const gigante = `${"a".repeat(250)}@empresa.com`;
    expect(lerPayload(payloadValido({ record: usuario({ email: gigante }) }))).toBeNull();
  });

  it("rejeita tipos errados nos campos de controle", () => {
    expect(lerPayload(payloadValido({ type: 1 }))).toBeNull();
    expect(lerPayload(payloadValido({ table: null }))).toBeNull();
    expect(lerPayload(payloadValido({ schema: {} }))).toBeNull();
  });

  it("aceita old_record ausente, tratando como nulo", () => {
    const payload = lerPayload(payloadValido({ old_record: null }));
    expect(payload?.old_record).toBeNull();
  });

  it("normaliza espacos em volta do e-mail", () => {
    const payload = lerPayload(payloadValido({ record: usuario({ email: "  a@b.com  " }) }));
    expect(payload?.record.email).toBe("a@b.com");
  });
});

describe("isEventoRelevante", () => {
  it("aceita UPDATE em auth.users", () => {
    expect(isEventoRelevante(lerPayload(payloadValido())!)).toBe(true);
  });

  it("recusa outra tabela, outro schema ou outro tipo", () => {
    expect(isEventoRelevante(lerPayload(payloadValido({ table: "profiles" }))!)).toBe(false);
    expect(isEventoRelevante(lerPayload(payloadValido({ schema: "public" }))!)).toBe(false);
    expect(isEventoRelevante(lerPayload(payloadValido({ type: "INSERT" }))!)).toBe(false);
  });
});

describe("isSenhaAlterada", () => {
  it("detecta hash diferente entre antes e depois", () => {
    expect(isSenhaAlterada(lerPayload(payloadValido())!)).toBe(true);
  });

  it("ignora update que nao mexeu na senha", () => {
    const igual = payloadValido({ record: usuario(), old_record: usuario() });
    expect(isSenhaAlterada(lerPayload(igual)!)).toBe(false);
  });

  it("ignora quando falta um dos lados", () => {
    const semAntigo = payloadValido({ old_record: null });
    expect(isSenhaAlterada(lerPayload(semAntigo)!)).toBe(false);

    const semNovo = payloadValido({ record: usuario({ encrypted_password: null }) });
    expect(isSenhaAlterada(lerPayload(semNovo)!)).toBe(false);
  });
});
