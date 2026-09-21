import { describe, expect, it } from "vitest";
import {
  eFormatoDoWebhookAntigo,
  lerAvisoDeTrocaDeSenha,
  segredoConfere,
  TIPO_TROCA_DE_SENHA,
} from "./webhook-user-updated";

const avisoValido = (extra: Record<string, unknown> = {}) => ({
  type: TIPO_TROCA_DE_SENHA,
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "pessoa@empresa.com",
  ...extra,
});

describe("segredoConfere", () => {
  it("aceita o segredo correto", () => {
    expect(segredoConfere("segredo-de-teste", "segredo-de-teste")).toBe(true);
  });

  it("rejeita segredo errado do mesmo tamanho", () => {
    expect(segredoConfere("segredo-de-teXte", "segredo-de-teste")).toBe(false);
  });

  it("rejeita segredo de tamanho diferente sem lancar excecao", () => {
    expect(() => segredoConfere("curto", "segredo-bem-mais-comprido")).not.toThrow();
    expect(segredoConfere("curto", "segredo-bem-mais-comprido")).toBe(false);
  });

  it("rejeita header ausente", () => {
    expect(segredoConfere(null, "segredo")).toBe(false);
    expect(segredoConfere(undefined, "segredo")).toBe(false);
    expect(segredoConfere("", "segredo")).toBe(false);
  });
});

describe("lerAvisoDeTrocaDeSenha", () => {
  it("aceita o corpo do trigger da 0053", () => {
    expect(lerAvisoDeTrocaDeSenha(avisoValido())).toEqual({
      userId: "11111111-1111-1111-1111-111111111111",
      email: "pessoa@empresa.com",
    });
  });

  it("rejeita valores que nao sao objeto", () => {
    for (const valor of [null, undefined, "texto", 42, []]) {
      expect(lerAvisoDeTrocaDeSenha(valor)).toBeNull();
    }
  });

  it("rejeita outro tipo de evento", () => {
    expect(lerAvisoDeTrocaDeSenha(avisoValido({ type: "UPDATE" }))).toBeNull();
  });

  it("rejeita user_id que nao e UUID", () => {
    expect(lerAvisoDeTrocaDeSenha(avisoValido({ user_id: "1" }))).toBeNull();
    expect(lerAvisoDeTrocaDeSenha(avisoValido({ user_id: 7 }))).toBeNull();
  });

  it("rejeita e-mail fora de formato ou acima de 254 caracteres", () => {
    expect(lerAvisoDeTrocaDeSenha(avisoValido({ email: "sem-arroba" }))).toBeNull();
    expect(lerAvisoDeTrocaDeSenha(avisoValido({ email: `${"a".repeat(250)}@x.com` }))).toBeNull();
  });

  it("normaliza espacos em volta do e-mail", () => {
    expect(lerAvisoDeTrocaDeSenha(avisoValido({ email: "  pessoa@empresa.com " }))?.email).toBe(
      "pessoa@empresa.com",
    );
  });

  it("nao le campo nenhum alem dos tres -- hash de senha nao e dado desta rota", () => {
    const aviso = lerAvisoDeTrocaDeSenha(avisoValido({ encrypted_password: "hash" }));

    expect(aviso).toEqual({ userId: "11111111-1111-1111-1111-111111111111", email: "pessoa@empresa.com" });
  });
});

describe("eFormatoDoWebhookAntigo", () => {
  const antigo = {
    type: "UPDATE",
    table: "users",
    schema: "auth",
    record: { id: "x", email: "pessoa@empresa.com", encrypted_password: "hash" },
    old_record: null,
  };

  it("reconhece o corpo do Database Webhook do painel", () => {
    expect(eFormatoDoWebhookAntigo(antigo)).toBe(true);
  });

  it("nao confunde o aviso novo nem lixo com o formato antigo", () => {
    expect(eFormatoDoWebhookAntigo(avisoValido())).toBe(false);
    expect(eFormatoDoWebhookAntigo({ qualquer: "coisa" })).toBe(false);
    expect(eFormatoDoWebhookAntigo(null)).toBe(false);
  });

  it("nao trata record nulo como formato antigo (typeof null e 'object')", () => {
    expect(eFormatoDoWebhookAntigo({ ...antigo, record: null })).toBe(false);
  });
});
