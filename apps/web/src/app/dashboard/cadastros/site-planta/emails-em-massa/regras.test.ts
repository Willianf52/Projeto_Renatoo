import { describe, expect, it } from "vitest";
import { juntarLocais, lerPedido, linhaDoUpdate, mensagemDeSucesso } from "./regras";

function formulario(campos: Record<string, string | string[]>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) dados.append(chave, v);
  }
  return dados;
}

const VALIDO = { locais: ["5"], emails: "a@x.com", tipos: ["checklists"] };

describe("lerPedido", () => {
  it("aceita locais avulsos, e-mails e um tipo", () => {
    const r = lerPedido(formulario(VALIDO));
    expect(r).toEqual({
      ok: true,
      pedido: { grupos: [], locais: [5], emails: ["a@x.com"], colunas: ["emails_checklist"] },
    });
  });

  it("aceita so grupos, sem locais avulsos", () => {
    const r = lerPedido(formulario({ ...VALIDO, locais: [], grupos: ["2", "2", "3"] }));
    expect(r.ok && r.pedido.grupos).toEqual([2, 3]);
  });

  it("exige grupo ou local", () => {
    expect(lerPedido(formulario({ ...VALIDO, locais: [] }))).toEqual({
      ok: false,
      erro: "Selecione ao menos um grupo de sites ou um local.",
    });
  });

  it("recusa id que nao e numero inteiro positivo", () => {
    expect(lerPedido(formulario({ ...VALIDO, locais: ["abc"] })).ok).toBe(false);
    expect(lerPedido(formulario({ ...VALIDO, grupos: ["0"] })).ok).toBe(false);
  });

  it("exige ao menos um tipo e ignora tipo desconhecido (FieldLab nao existe aqui)", () => {
    expect(lerPedido(formulario({ ...VALIDO, tipos: [] }))).toEqual({
      ok: false,
      erro: "Marque ao menos um tipo de atualização.",
    });
    expect(lerPedido(formulario({ ...VALIDO, tipos: ["fieldlab"] })).ok).toBe(false);
  });

  it("os dois tipos marcados viram as duas colunas", () => {
    const r = lerPedido(formulario({ ...VALIDO, tipos: ["eventos", "checklists"] }));
    expect(r.ok && r.pedido.colunas).toEqual(["emails_checklist", "emails_eventos"]);
  });

  it("exige ao menos um e-mail e recusa e-mail invalido", () => {
    expect(lerPedido(formulario({ ...VALIDO, emails: "  " }))).toEqual({
      ok: false,
      erro: "Informe ao menos um e-mail.",
    });
    expect(lerPedido(formulario({ ...VALIDO, emails: "a@x.com; nao-e-email" }))).toEqual({
      ok: false,
      erro: "E-mail inválido: nao-e-email",
    });
  });

  it("normaliza e tira repetidos, e respeita o teto de 20 do banco", () => {
    const r = lerPedido(formulario({ ...VALIDO, emails: "A@x.com, a@x.com\nb@y.com" }));
    expect(r.ok && r.pedido.emails).toEqual(["a@x.com", "b@y.com"]);

    const muitos = Array.from({ length: 21 }, (_, i) => `p${i}@x.com`).join(";");
    expect(lerPedido(formulario({ ...VALIDO, emails: muitos }))).toEqual({
      ok: false,
      erro: "No máximo 20 e-mails.",
    });
  });
});

describe("juntarLocais, linhaDoUpdate e mensagemDeSucesso", () => {
  it("junta avulsos e locais dos grupos sem repetir", () => {
    expect(juntarLocais([1, 2], [2, 3])).toEqual([1, 2, 3]);
  });

  it("a mesma lista em cada coluna marcada", () => {
    expect(
      linhaDoUpdate({ grupos: [], locais: [1], emails: ["a@x.com"], colunas: ["emails_checklist", "emails_eventos"] }),
    ).toEqual({ emails_checklist: ["a@x.com"], emails_eventos: ["a@x.com"] });
  });

  it("singular e plural, como no antigo", () => {
    expect(mensagemDeSucesso(1)).toBe("E-mails alterados em 1 local.");
    expect(mensagemDeSucesso(12)).toBe("E-mails alterados em 12 locais.");
  });
});
