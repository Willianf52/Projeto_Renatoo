import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O foco destes testes e o portao de permissao.
 *
 * `salvarUsuario` escreve com service_role, que ignora o RLS inteiro -- nao ha
 * politica no banco atras dela para segurar o que passar. A checagem em
 * `podeAdministrarUsuarios()` e a unica coisa entre um POST montado a mao e a
 * coluna `cargo`. Por isso "nao escreve nada quando nao autorizado" e o caso
 * mais importante do arquivo, e nao um detalhe.
 */

type Erro = { message: string } | null;

const {
  podeAdministrarUsuariosMock,
  createAdminClientMock,
  createClientMock,
  redirectMock,
  revalidatePathMock,
  resultados,
  chamadas,
} = vi.hoisted(() => {
  const resultados = {
    criarUsuario: {
      data: { user: { id: "novo-id" } } as { user: { id: string } | null },
      error: null as Erro,
    },
    atualizarPerfil: { error: null as Erro },
    lerPerfil: {
      data: { cargo: "OPERADOR", ativo: true } as { cargo: string; ativo: boolean } | null,
      error: null as Erro,
    },
    trocarSenha: { error: null as Erro },
    sessao: { data: { user: { id: "quem-edita" } } },
    limparEscopo: { error: null as Erro },
    inserirEscopo: { error: null as Erro },
  };

  type Chamada = { tipo: string; args: unknown[] };
  const chamadas: Chamada[] = [];
  const registrar = (tipo: string, ...args: unknown[]) => chamadas.push({ tipo, args });

  const createAdminClientMock = vi.fn(() => ({
    auth: {
      admin: {
        createUser: async (dados: unknown) => {
          registrar("createUser", dados);
          return resultados.criarUsuario;
        },
        deleteUser: async (id: string) => {
          registrar("deleteUser", id);
          return { error: null };
        },
        updateUserById: async (id: string, dados: unknown) => {
          registrar("updateUserById", id, dados);
          return resultados.trocarSenha;
        },
      },
    },
    // A tabela importa: `profiles` e `grupos_sites_clientes` passam pelo mesmo
    // `from`, e os testes de escopo precisam distinguir as duas.
    from: (tabela: string) => ({
      update: (linha: Record<string, unknown>) => {
        registrar("updatePerfil", linha);
        return { eq: async () => resultados.atualizarPerfil };
      },
      insert: (linhas: unknown) => {
        registrar("inserirEscopo", linhas);
        return Promise.resolve(resultados.inserirEscopo);
      },
      delete: () => ({
        eq: async (coluna: string, valor: unknown) => {
          registrar("limparEscopo", tabela, coluna, valor);
          return resultados.limparEscopo;
        },
      }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => resultados.lerPerfil }),
      }),
    }),
  }));

  const createClientMock = vi.fn(async () => ({
    auth: { getUser: async () => resultados.sessao },
  }));

  return {
    podeAdministrarUsuariosMock: vi.fn(async () => true),
    createAdminClientMock,
    createClientMock,
    redirectMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    resultados,
    chamadas,
  };
});

vi.mock("@/lib/permissoes", () => ({ podeAdministrarUsuarios: podeAdministrarUsuariosMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { salvarUsuario } = await import("./actions");

const LISTAGEM = "/dashboard/cadastros/usuarios";
const SENHA_VALIDA = "Senha@123";

/** Campos minimos para criar; cada teste sobrescreve o que exercita. */
const CRIAR = {
  nome_completo: "Maria Silva",
  email: "maria@exemplo.com",
  senha: SENHA_VALIDA,
  cargo: "OPERADOR",
};

/** Minimos para editar: sem e-mail nem senha. */
const EDITAR = {
  id: "alvo-id",
  nome_completo: "Maria Silva",
  cargo: "OPERADOR",
};

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

const tipos = () => chamadas.map((c) => c.tipo);
const primeira = (tipo: string) => chamadas.find((c) => c.tipo === tipo);

beforeEach(() => {
  vi.clearAllMocks();
  chamadas.length = 0;
  podeAdministrarUsuariosMock.mockResolvedValue(true);
  resultados.criarUsuario = { data: { user: { id: "novo-id" } }, error: null };
  resultados.atualizarPerfil = { error: null };
  resultados.lerPerfil = { data: { cargo: "OPERADOR", ativo: true }, error: null };
  resultados.trocarSenha = { error: null };
  resultados.sessao = { data: { user: { id: "quem-edita" } } };
  resultados.limparEscopo = { error: null };
  resultados.inserirEscopo = { error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("autorização", () => {
  it("não escreve nada quando quem chama não administra usuários", async () => {
    podeAdministrarUsuariosMock.mockResolvedValue(false);

    const estado = await salvarUsuario({}, formulario(CRIAR));

    expect(estado.erro).toContain("não tem permissão");
    // O ponto do teste: nem o cliente admin chegou a ser instanciado.
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(chamadas).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("recusa a edição também, não só a criação", async () => {
    podeAdministrarUsuariosMock.mockResolvedValue(false);

    await salvarUsuario({}, formulario(EDITAR));

    expect(chamadas).toHaveLength(0);
  });

  it("checa a permissão antes de qualquer validação", async () => {
    // Um formulario invalido nao deve revelar, pela mensagem, que teria
    // passado no portao.
    podeAdministrarUsuariosMock.mockResolvedValue(false);

    const estado = await salvarUsuario({}, formulario({ ...CRIAR, nome_completo: "" }));

    expect(estado.erro).toContain("não tem permissão");
  });
});

describe("validação", () => {
  it("recusa nível de acesso fora da lista fechada", async () => {
    // O `<select>` da tela nao e garantia: o POST pode ser montado a mao, e
    // `cargo` e a coluna que define poder.
    const estado = await salvarUsuario({}, formulario({ ...CRIAR, cargo: "SUPERADMIN" }));

    expect(estado.erro).toBe("Selecione um nível de acesso válido.");
    expect(chamadas).toHaveLength(0);
  });

  it("recusa nome vazio", async () => {
    const estado = await salvarUsuario({}, formulario({ ...CRIAR, nome_completo: "  " }));

    expect(estado.erro).toBe("Informe o nome completo.");
    expect(chamadas).toHaveLength(0);
  });

  it("recusa e-mail inválido na criação", async () => {
    const estado = await salvarUsuario({}, formulario({ ...CRIAR, email: "maria@" }));

    expect(estado.erro).toBe("Informe um e-mail válido.");
    expect(tipos()).not.toContain("createUser");
  });

  it("recusa senha fraca antes de tocar no banco", async () => {
    const estado = await salvarUsuario({}, formulario({ ...CRIAR, senha: "123" }));

    expect(estado.erro).toBe("A senha não atende aos requisitos.");
    expect(chamadas).toHaveLength(0);
  });

  it("nunca devolve a senha para a tela", async () => {
    // Devolvida, ela atravessaria a resposta e ficaria no HTML renderizado.
    const estado = await salvarUsuario({}, formulario({ ...CRIAR, nome_completo: "" }));

    expect(estado.valores?.senha).toBe("");
    expect(estado.valores?.nomeCompleto).toBe("");
  });
});

describe("criação", () => {
  it("cria a conta já confirmada e aplica o perfil escolhido", async () => {
    await salvarUsuario({}, formulario({ ...CRIAR, cargo: "SUPERVISOR", ativo: "on" }));

    // `email_confirm` porque quem cria e a gestao: nao ha e-mail de
    // confirmacao para a pessoa responder, e sem isso a conta nasce sem logar.
    expect(primeira("createUser")?.args[0]).toMatchObject({
      email: "maria@exemplo.com",
      email_confirm: true,
    });

    // O trigger da 0008 cria o perfil sempre OPERADOR e inativo; o nivel e a
    // situacao escolhidos sao aplicados neste segundo passo.
    expect(primeira("updatePerfil")?.args[0]).toMatchObject({
      nome_completo: "Maria Silva",
      cargo: "SUPERVISOR",
      ativo: true,
    });

    expect(revalidatePathMock).toHaveBeenCalledWith(LISTAGEM);
    expect(redirectMock).toHaveBeenCalledWith(LISTAGEM);
  });

  it("normaliza o e-mail para minúsculas", async () => {
    await salvarUsuario({}, formulario({ ...CRIAR, email: "Maria@Exemplo.COM" }));

    expect(primeira("createUser")?.args[0]).toMatchObject({ email: "maria@exemplo.com" });
  });

  it("desfaz a conta quando o perfil não grava", async () => {
    // A conta de autenticacao ja existe neste ponto. Deixa-la com o perfil
    // pela metade seria pior que nao ter criado: o e-mail ficaria ocupado.
    resultados.atualizarPerfil = { error: { message: "falha" } };

    const estado = await salvarUsuario({}, formulario(CRIAR));

    expect(tipos()).toEqual(["createUser", "updatePerfil", "deleteUser"]);
    expect(tipos()).not.toContain("limparEscopo");
    expect(primeira("deleteUser")?.args[0]).toBe("novo-id");
    expect(estado.erro).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("traduz e-mail já cadastrado", async () => {
    resultados.criarUsuario = {
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    };

    const estado = await salvarUsuario({}, formulario(CRIAR));

    expect(estado.erro).toBe("Já existe um usuário com esse e-mail.");
  });

  it("converte campos de texto vazios em null", async () => {
    // "" e um valor; null e "nao informado". A listagem distingue os dois.
    await salvarUsuario({}, formulario(CRIAR));

    const perfil = primeira("updatePerfil")?.args[0] as Record<string, unknown>;
    expect(perfil.login).toBeNull();
    expect(perfil.funcao).toBeNull();
    expect(perfil.superior_id).toBeNull();
  });

  it("nasce inativo quando o checkbox não vem", async () => {
    await salvarUsuario({}, formulario(CRIAR));

    expect(primeira("updatePerfil")?.args[0]).toMatchObject({ ativo: false });
  });
});

describe("edição", () => {
  it("atualiza o perfil sem tocar na senha quando ela vem em branco", async () => {
    await salvarUsuario({}, formulario(EDITAR));

    // `limparEscopo` entra em todo salvamento: um nivel diferente de CLIENTE
    // limpa o vinculo em vez de ignora-lo -- ver a suite "escopo do cliente".
    expect(tipos()).toEqual(["limparEscopo", "updatePerfil"]);
    expect(redirectMock).toHaveBeenCalledWith(LISTAGEM);
  });

  it("troca a senha quando preenchida", async () => {
    await salvarUsuario({}, formulario({ ...EDITAR, senha: SENHA_VALIDA }));

    expect(primeira("updateUserById")?.args).toEqual(["alvo-id", { password: SENHA_VALIDA }]);
  });

  it("recusa senha fraca antes de gravar o perfil", async () => {
    // A ordem importa: recusada depois, o perfil ficaria salvo e so a senha
    // por aplicar -- meio salvamento sem aviso nenhum.
    const estado = await salvarUsuario({}, formulario({ ...EDITAR, senha: "123" }));

    expect(estado.erro).toBe("A senha não atende aos requisitos.");
    expect(chamadas).toHaveLength(0);
  });

  it("avisa quando o usuário não existe mais", async () => {
    resultados.lerPerfil = { data: null, error: null };

    const estado = await salvarUsuario({}, formulario(EDITAR));

    expect(estado.erro).toBe("Usuário não encontrado.");
    expect(tipos()).not.toContain("updatePerfil");
  });

  it("recusa um usuário como superior de si mesmo", async () => {
    const estado = await salvarUsuario(
      {},
      formulario({ ...EDITAR, superior_id: "alvo-id" }),
    );

    expect(estado.erro).toBe("Um usuário não pode ser o próprio superior.");
    expect(tipos()).not.toContain("updatePerfil");
  });
});

describe("proteção contra se trancar para fora", () => {
  /** Quem edita e o proprio alvo. */
  const proprioPerfil = { ...EDITAR, id: "quem-edita" };

  it("impede desativar a própria conta", async () => {
    // Sem isto o gestor perde a sessao no proximo passo do middleware, e se
    // for o unico nao sobra ninguem para reativa-lo.
    resultados.lerPerfil = { data: { cargo: "GESTOR", ativo: true }, error: null };

    const estado = await salvarUsuario({}, formulario({ ...proprioPerfil, cargo: "GESTOR" }));

    expect(estado.erro).toBe("Você não pode desativar a própria conta.");
    expect(tipos()).not.toContain("updatePerfil");
  });

  it("impede alterar o próprio nível de acesso", async () => {
    resultados.lerPerfil = { data: { cargo: "GESTOR", ativo: true }, error: null };

    const estado = await salvarUsuario(
      {},
      formulario({ ...proprioPerfil, cargo: "OPERADOR", ativo: "on" }),
    );

    expect(estado.erro).toContain("não pode alterar o próprio nível de acesso");
    expect(tipos()).not.toContain("updatePerfil");
  });

  it("deixa editar os próprios dados quando nível e situação não mudam", async () => {
    resultados.lerPerfil = { data: { cargo: "GESTOR", ativo: true }, error: null };

    await salvarUsuario(
      {},
      formulario({ ...proprioPerfil, cargo: "GESTOR", ativo: "on", funcao: "Coordenação" }),
    );

    expect(primeira("updatePerfil")?.args[0]).toMatchObject({ funcao: "Coordenação" });
  });

  it("deixa outro gestor mudar o nível de acesso de alguém", async () => {
    // O caso legitimo continua possivel -- por outro gestor, que e como uma
    // mudanca de poder deve acontecer.
    resultados.lerPerfil = { data: { cargo: "OPERADOR", ativo: true }, error: null };

    await salvarUsuario({}, formulario({ ...EDITAR, cargo: "GESTOR", ativo: "on" }));

    expect(primeira("updatePerfil")?.args[0]).toMatchObject({ cargo: "GESTOR" });
  });
});

describe("escopo do cliente", () => {
  /**
   * Migration 0014. Sem vinculo, um CLIENTE nao enxerga operacao nenhuma --
   * que e o padrao seguro, e o motivo de o vinculo ser gravado aqui e nao
   * ficar a cargo de quem cadastra depois.
   */
  it("grava os grupos escolhidos para um CLIENTE", async () => {
    const dados = formulario({ ...EDITAR, cargo: "CLIENTE" });
    dados.append("grupos_do_cliente", "1");
    dados.append("grupos_do_cliente", "3");

    await salvarUsuario({}, dados);

    expect(primeira("inserirEscopo")?.args[0]).toEqual([
      { profile_id: "alvo-id", grupo_site_id: 1 },
      { profile_id: "alvo-id", grupo_site_id: 3 },
    ]);
  });

  it("limpa o vínculo antes de gravar, para o formulário refletir o estado final", async () => {
    // Sem a limpeza, desmarcar um grupo nao teria efeito nenhum: o insert so
    // acrescenta.
    const dados = formulario({ ...EDITAR, cargo: "CLIENTE" });
    dados.append("grupos_do_cliente", "1");

    await salvarUsuario({}, dados);

    expect(tipos().indexOf("limparEscopo")).toBeLessThan(tipos().indexOf("inserirEscopo"));
    expect(primeira("limparEscopo")?.args).toEqual([
      "grupos_sites_clientes",
      "profile_id",
      "alvo-id",
    ]);
  });

  it("limpa o vínculo quando o nível deixa de ser CLIENTE", async () => {
    // Rebaixar alguem e depois promove-lo de volta a CLIENTE reativaria em
    // silencio um escopo que ninguem reviu. Some junto com o nivel.
    const dados = formulario({ ...EDITAR, cargo: "OPERADOR" });
    dados.append("grupos_do_cliente", "1");

    await salvarUsuario({}, dados);

    expect(tipos()).toContain("limparEscopo");
    expect(tipos()).not.toContain("inserirEscopo");
  });

  it("aceita CLIENTE sem grupo nenhum, sem inserir linha vazia", async () => {
    await salvarUsuario({}, formulario({ ...EDITAR, cargo: "CLIENTE" }));

    expect(tipos()).toContain("limparEscopo");
    expect(tipos()).not.toContain("inserirEscopo");
  });

  it("recusa id de grupo que não é número", async () => {
    // Os checkboxes da tela nao sao garantia: o POST pode ser montado a mao, e
    // o valor vai para uma FK bigint.
    const dados = formulario({ ...EDITAR, cargo: "CLIENTE" });
    dados.append("grupos_do_cliente", "1; drop table");

    const estado = await salvarUsuario({}, dados);

    expect(estado.erro).toBe("Grupo de sites inválido.");
    expect(chamadas).toHaveLength(0);
  });

  it("desfaz a conta nova quando o escopo não grava", async () => {
    // Um CLIENTE sem o escopo que era para ter enxerga zero coletas e parece
    // conta quebrada -- mesmo raciocinio da falha ao gravar o perfil.
    resultados.inserirEscopo = { error: { message: "falha" } };

    const dados = formulario({ ...CRIAR, cargo: "CLIENTE" });
    dados.append("grupos_do_cliente", "1");

    const estado = await salvarUsuario({}, dados);

    expect(tipos()).toContain("deleteUser");
    expect(estado.erro).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("não grava o perfil se o escopo falhou na edição", async () => {
    resultados.inserirEscopo = { error: { message: "falha" } };

    const dados = formulario({ ...EDITAR, cargo: "CLIENTE" });
    dados.append("grupos_do_cliente", "1");

    await salvarUsuario({}, dados);

    expect(tipos()).not.toContain("updatePerfil");
  });
});

describe("service_role ausente", () => {
  it("explica o que falta em vez de estourar", async () => {
    createAdminClientMock.mockImplementationOnce(() => {
      throw new Error("Variável de ambiente ausente: SUPABASE_SERVICE_ROLE_KEY.");
    });

    const estado = await salvarUsuario({}, formulario(CRIAR));

    expect(estado.erro).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
