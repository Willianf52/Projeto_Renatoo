import { describe, expect, it } from "vitest";
import { verificarEscritaComRls } from "./escrita-rls";

const MENSAGENS = {
  duplicado: "Já existe um registro com esse nome.",
  semPermissao: "Você não tem permissão para cadastrar.",
  generico: "Não foi possível salvar. Tente novamente.",
};

const SEM_PERMISSAO_PARA_EDITAR = "Você não tem permissão para editar este registro, ou ele não existe mais.";

describe("verificarEscritaComRls", () => {
  it("traduz o erro do Postgres quando a escrita falha alto", () => {
    const resultado = verificarEscritaComRls(
      { data: null, error: { code: "23505" } },
      MENSAGENS,
      SEM_PERMISSAO_PARA_EDITAR,
    );

    expect(resultado).toEqual({ ok: false, erro: MENSAGENS.duplicado });
  });

  it("devolve a mensagem de sem-permissao quando zero linhas foram afetadas em silencio", () => {
    // O caso do UPDATE/DELETE barrado pelo RLS: sem erro, sem linha.
    const resultado = verificarEscritaComRls({ data: null, error: null }, MENSAGENS, SEM_PERMISSAO_PARA_EDITAR);

    expect(resultado).toEqual({ ok: false, erro: SEM_PERMISSAO_PARA_EDITAR });
  });

  it("devolve os dados quando a escrita afeta exatamente uma linha", () => {
    const resultado = verificarEscritaComRls({ data: { id: 7 }, error: null }, MENSAGENS, SEM_PERMISSAO_PARA_EDITAR);

    expect(resultado).toEqual({ ok: true, data: { id: 7 } });
  });
});
