import { describe, expect, it } from "vitest";
import {
  CONFIGURACAO_PADRAO,
  lerConfiguracaoDoCliente,
  remetenteComNome,
  type ConfiguracaoDoCliente,
} from "./configuracao-do-cliente";

const COM_NOME: ConfiguracaoDoCliente = { ...CONFIGURACAO_PADRAO, nomeFantasia: "Up Matriz", nomeFantasiaNoRemetente: true };

describe("remetenteComNome", () => {
  it("troca o nome de exibição e mantém o endereço", () => {
    expect(remetenteComNome("Up Serviços <avisos@dominio.test>", COM_NOME)).toBe("Up Matriz <avisos@dominio.test>");
  });

  it("desligado, sem nome ou sem endereço entre <>, devolve como veio", () => {
    expect(remetenteComNome("Up <a@b.test>", CONFIGURACAO_PADRAO)).toBe("Up <a@b.test>");
    expect(remetenteComNome("Up <a@b.test>", { ...COM_NOME, nomeFantasia: "  " })).toBe("Up <a@b.test>");
    expect(remetenteComNome("a@b.test", COM_NOME)).toBe("a@b.test");
  });

  it("tira do nome o que quebraria o cabeçalho", () => {
    expect(remetenteComNome("X <a@b.test>", { ...COM_NOME, nomeFantasia: 'Up "<Matriz>"\n' })).toBe(
      "Up Matriz <a@b.test>",
    );
  });
});

describe("lerConfiguracaoDoCliente", () => {
  const banco = (resposta: { data: unknown; error: unknown } | Error) => ({
    from: () => ({
      select: () => ({
        maybeSingle: async () => {
          if (resposta instanceof Error) throw resposta;
          return resposta;
        },
      }),
    }),
  });

  it("lê a linha do banco", async () => {
    const config = await lerConfiguracaoDoCliente(
      banco({
        data: {
          nome_fantasia: "Up",
          titulo_pdf: "Relatório",
          nome_fantasia_no_remetente: true,
          legenda_nas_imagens: false,
          min_caracteres_descricao: 5,
          min_caracteres_acoes: 9,
        },
        error: null,
      }),
    );
    expect(config).toEqual({
      nomeFantasia: "Up",
      tituloPdf: "Relatório",
      nomeFantasiaNoRemetente: true,
      legendaNasImagens: false,
      minCaracteresDescricao: 5,
      minCaracteresAcoes: 9,
    });
  });

  it("erro ou exceção: os padrões, sem derrubar quem chamou", async () => {
    expect(await lerConfiguracaoDoCliente(banco({ data: null, error: { code: "42501" } }))).toEqual(CONFIGURACAO_PADRAO);
    expect(await lerConfiguracaoDoCliente(banco(new Error("rede")))).toEqual(CONFIGURACAO_PADRAO);
  });
});
