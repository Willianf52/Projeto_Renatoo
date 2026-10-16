import { describe, expect, it } from "vitest";
import { MAXIMO_DE_LINHAS, emailDeAcesso, planejarImportacaoDeUsuarios, type PerfilConhecido } from "./importacao";

const CABECALHO = ["Nome", "Login", "E-mail", "Função", "Nível de Acesso", "Usuário Superior", "E-mail Ocorrência", "Status"];

const semPortal = { perfis: [] as PerfilConhecido[], grupos: [] as { id: number; nome: string }[] };

function planejar(linhas: string[][], ref = semPortal) {
  const plano = planejarImportacaoDeUsuarios([CABECALHO, ...linhas], ref);
  if (!plano.ok) throw new Error(plano.erro);
  return plano;
}

describe("emailDeAcesso", () => {
  it("o login com formato de e-mail vale mais que o e-mail", () => {
    expect(emailDeAcesso("", "Eric@Servicosup.com.br", "villadobosque@gmail.com")).toBe("eric@servicosup.com.br");
  });

  it("login sem formato de e-mail cai para o e-mail", () => {
    expect(emailDeAcesso("", "Rodrigo.operacional00", "operacional00@servicosup.com.br")).toBe(
      "operacional00@servicosup.com.br",
    );
    expect(emailDeAcesso("", "Gilmar@servicosup", "operacional010@servicosup.com")).toBe("operacional010@servicosup.com");
  });

  it("a coluna de acesso decide sozinha, mesmo errada", () => {
    expect(emailDeAcesso("acesso@exemplo.com", "login@exemplo.com", "")).toBe("acesso@exemplo.com");
    expect(emailDeAcesso("sem-arroba", "login@exemplo.com", "")).toBeNull();
  });

  it("nenhum dos tres com formato de e-mail", () => {
    expect(emailDeAcesso("", "so.login", "")).toBeNull();
  });
});

describe("planejarImportacaoDeUsuarios", () => {
  it("le os campos e traduz nivel, status e os avisos ao superior", () => {
    const plano = planejar([["Ana", "ana@exemplo.com", "", "Supervisora", "Supervisor", "", "Sim", "Ativo"]]);

    expect(plano.erros).toEqual([]);
    expect(plano.novos).toHaveLength(1);
    expect(plano.novos[0]).toMatchObject({
      linha: 2,
      chave: "ana@exemplo.com",
      superior: null,
      nivel: 0,
      dados: {
        nomeCompleto: "Ana",
        email: "ana@exemplo.com",
        funcao: "Supervisora",
        cargo: "SUPERVISOR",
        tipo: "PADRAO",
        ativo: true,
        emailSuperiorOcorrencia: true,
        emailSuperiorChecklist: false,
        emailSuperiorEvento: false,
      },
    });
  });

  it("status Inativo cria a conta desativada", () => {
    const plano = planejar([["Ana", "ana@exemplo.com", "", "", "Operador", "", "", "Inativo"]]);
    expect(plano.novos[0].dados.ativo).toBe(false);
  });

  it("quem ja existe no portal e pulado, nao alterado", () => {
    const plano = planejar([["Ana", "ana@exemplo.com", "", "", "Gestor", "", "", ""]], {
      perfis: [{ id: "p1", email: "ana@exemplo.com", nome: "Ana", login: null }],
      grupos: [],
    });

    expect(plano.novos).toEqual([]);
    expect(plano.existentes).toEqual([{ linha: 2, nome: "Ana", email: "ana@exemplo.com" }]);
  });

  it("superior novo nasce antes: o subordinado fica no nivel de baixo", () => {
    const plano = planejar([
      ["Gil", "gil@exemplo.com", "", "", "Operacional", "Gesiel", "", ""],
      ["Gesiel", "novo.gesiel@exemplo.com", "", "", "Gestor", "", "", ""],
    ]);

    expect(plano.erros).toEqual([]);
    const porNome = Object.fromEntries(plano.novos.map((n) => [n.dados.nomeCompleto, n]));
    expect(porNome.Gesiel.nivel).toBe(0);
    expect(porNome.Gil.nivel).toBe(1);
    expect(porNome.Gil.superior).toEqual({ tipo: "novo", chave: "novo.gesiel@exemplo.com" });
  });

  it("superior que ja existe no portal, achado pelo e-mail", () => {
    const plano = planejar([["Gil", "gil@exemplo.com", "", "", "Operacional", "chefe@exemplo.com", "", ""]], {
      perfis: [{ id: "p9", email: "chefe@exemplo.com", nome: "Chefe", login: null }],
      grupos: [],
    });

    expect(plano.novos[0].superior).toEqual({ tipo: "existente", id: "p9" });
    expect(plano.novos[0].superiorNome).toBe("Chefe");
  });

  it("superior que nao existe em lugar nenhum e erro", () => {
    const plano = planejar([["Gil", "gil@exemplo.com", "", "", "Operacional", "Fulano", "", ""]]);
    expect(plano.erros).toEqual([
      { linha: 2, mensagem: 'Gil: superior "Fulano" não encontrado no arquivo nem no portal.' },
    ]);
  });

  it("superiores em ciclo sao erro", () => {
    const plano = planejar([
      ["A", "a@exemplo.com", "", "", "Gestor", "B", "", ""],
      ["B", "b@exemplo.com", "", "", "Gestor", "A", "", ""],
    ]);
    expect(plano.erros.map((e) => e.mensagem)).toEqual([
      "A: os superiores formam um ciclo no arquivo.",
      "B: os superiores formam um ciclo no arquivo.",
    ]);
  });

  it("o proprio usuario como superior e erro", () => {
    const plano = planejar([["A", "a@exemplo.com", "", "", "Gestor", "A", "", ""]]);
    expect(plano.erros[0].mensagem).toBe("A: um usuário não pode ser o próprio superior.");
  });

  it("e-mail de acesso repetido no arquivo e erro na segunda linha", () => {
    const plano = planejar([
      ["A", "a@exemplo.com", "", "", "Gestor", "", "", ""],
      ["A de novo", "A@exemplo.com", "", "", "Gestor", "", "", ""],
    ]);
    expect(plano.erros).toEqual([
      { linha: 3, mensagem: "A de novo: o e-mail de acesso a@exemplo.com já aparece na linha 2." },
    ]);
  });

  it("nivel, aviso e e-mail invalidos viram erro com o nome da pessoa", () => {
    const plano = planejar([
      ["A", "a@exemplo.com", "", "", "Chefe", "", "", ""],
      ["B", "b@exemplo.com", "", "", "Gestor", "", "talvez", ""],
      ["C", "so-login", "", "", "Gestor", "", "", ""],
    ]);
    expect(plano.erros.map((e) => e.linha)).toEqual([2, 3, 4]);
    expect(plano.erros[0].mensagem).toContain('nível de acesso "Chefe" não existe');
    expect(plano.erros[2].mensagem).toContain("sem e-mail de acesso válido");
  });

  it("cliente: grupos por nome, e o que nao tem grupo e contado", () => {
    const comGrupos = planejarImportacaoDeUsuarios(
      [
        ["Nome", "E-mail", "Nível de Acesso", "Grupos de Sites"],
        ["Cliente A", "a@exemplo.com", "Cliente", "Alphaville 04 | Mondrian"],
        ["Cliente B", "b@exemplo.com", "Cliente", ""],
      ],
      { perfis: [], grupos: [{ id: 7, nome: "Alphaville 04" }, { id: 9, nome: "Mondrian" }] },
    );
    if (!comGrupos.ok) throw new Error(comGrupos.erro);
    expect(comGrupos.novos[0].dados.gruposDoCliente).toEqual(["7", "9"]);
    expect(comGrupos.clientesSemGrupo).toBe(1);
  });

  it("grupo de sites desconhecido para cliente e erro", () => {
    const plano = planejarImportacaoDeUsuarios(
      [
        ["Nome", "E-mail", "Nível de Acesso", "Grupos de Sites"],
        ["Cliente A", "a@exemplo.com", "Cliente", "Inexistente"],
      ],
      semPortal,
    );
    if (!plano.ok) throw new Error(plano.erro);
    expect(plano.erros[0].mensagem).toBe('Cliente A: grupo de sites "Inexistente" não existe no portal.');
  });

  it("linhas vazias sao ignoradas e o numero da linha continua o da planilha", () => {
    const plano = planejar([
      ["", "", "", "", "", "", "", ""],
      ["Ana", "ana@exemplo.com", "", "", "Gestor", "", "", ""],
    ]);
    expect(plano.novos[0].linha).toBe(3);
  });

  it("sem a coluna Nome, ou acima do teto, recusa o arquivo", () => {
    expect(planejarImportacaoDeUsuarios([["E-mail"], ["a@exemplo.com"]], semPortal)).toEqual({
      ok: false,
      erro: 'O arquivo precisa ter a coluna "Nome".',
    });

    const muitas = Array.from({ length: MAXIMO_DE_LINHAS + 1 }, (_, i) => [`P${i}`, `p${i}@exemplo.com`]);
    const plano = planejarImportacaoDeUsuarios([["Nome", "E-mail"], ...muitas], semPortal);
    expect(plano.ok).toBe(false);
  });
});
