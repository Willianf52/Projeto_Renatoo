import { describe, expect, it } from "vitest";
import { CODIGO_POSTGRES, traduzirErroPostgres } from "./postgrest-errors";

const MENSAGENS = {
  duplicado: "Já existe um site com esse nome.",
  semPermissao: "Você não tem permissão para cadastrar sites.",
  fkInvalida: "Grupo não existe mais. Recarregue a página.",
  generico: "Não foi possível salvar o site. Tente novamente.",
};

describe("traduzirErroPostgres", () => {
  it("traduz violação de unique", () => {
    expect(traduzirErroPostgres(CODIGO_POSTGRES.VALOR_DUPLICADO, MENSAGENS)).toBe(MENSAGENS.duplicado);
  });

  it("traduz escrita barrada pelo RLS", () => {
    expect(traduzirErroPostgres(CODIGO_POSTGRES.SEM_PERMISSAO, MENSAGENS)).toBe(MENSAGENS.semPermissao);
  });

  it("traduz FK inválida quando a tela informa a mensagem", () => {
    expect(traduzirErroPostgres(CODIGO_POSTGRES.FK_INVALIDA, MENSAGENS)).toBe(MENSAGENS.fkInvalida);
  });

  it("cai no genérico quando a tela não tem mensagem de FK", () => {
    const { fkInvalida: _semUso, ...semFk } = MENSAGENS;
    expect(traduzirErroPostgres(CODIGO_POSTGRES.FK_INVALIDA, semFk)).toBe(MENSAGENS.generico);
  });

  it("cai no genérico para código desconhecido ou ausente", () => {
    expect(traduzirErroPostgres("99999", MENSAGENS)).toBe(MENSAGENS.generico);
    expect(traduzirErroPostgres(undefined, MENSAGENS)).toBe(MENSAGENS.generico);
  });
});
