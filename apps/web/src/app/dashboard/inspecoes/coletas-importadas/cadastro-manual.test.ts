import { describe, expect, it } from "vitest";
import { lerCadastroManual } from "./cadastro-manual";

const UUID = "0b6c1f2e-3a4d-4b5c-8d9e-0f1a2b3c4d5e";

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

const VALIDO = { data: "2026-10-06", hora: "14:30", funcionario_id: UUID, site_id: "12", quantidade: "3" };

describe("lerCadastroManual", () => {
  it("le os obrigatorios e monta o instante no fuso da operacao", () => {
    const lido = lerCadastroManual(formulario(VALIDO));

    expect(lido).toEqual({
      ok: true,
      dados: {
        data: "2026-10-06",
        dataHora: "2026-10-06T14:30:00-03:00",
        siteId: 12,
        funcionarioId: UUID,
        quantidade: 3,
        coletorDadosId: null,
        areaId: null,
        eventoId: null,
        acaoId: null,
        qualificadorId: null,
      },
    });
  });

  it("os opcionais viram numero, e id torto e ignorado", () => {
    const lido = lerCadastroManual(
      formulario({ ...VALIDO, coletor_dados_id: "4", evento_id: "7", acao_id: "abc", area_id: "" }),
    );

    expect(lido.ok && lido.dados).toMatchObject({ coletorDadosId: 4, eventoId: 7, acaoId: null, areaId: null });
  });

  it("cada obrigatorio ausente tem a sua mensagem", () => {
    expect(lerCadastroManual(formulario({ ...VALIDO, data: "" }))).toEqual({ ok: false, erro: "Informe a data da coleta." });
    expect(lerCadastroManual(formulario({ ...VALIDO, hora: "25:00" }))).toEqual({ ok: false, erro: "Informe a hora da coleta." });
    expect(lerCadastroManual(formulario({ ...VALIDO, funcionario_id: "x" }))).toEqual({ ok: false, erro: "Escolha o funcionário." });
    expect(lerCadastroManual(formulario({ ...VALIDO, site_id: "" }))).toEqual({ ok: false, erro: "Escolha o local." });
  });

  it("quantidade fora de 1 a 50, ou nao inteira, e recusada", () => {
    for (const quantidade of ["0", "51", "2.5", "-1", "dez", ""]) {
      expect(lerCadastroManual(formulario({ ...VALIDO, quantidade })).ok).toBe(false);
    }
    expect(lerCadastroManual(formulario({ ...VALIDO, quantidade: "50" })).ok).toBe(true);
  });
});
