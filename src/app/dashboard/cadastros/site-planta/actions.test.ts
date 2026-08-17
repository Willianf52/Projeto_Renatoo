import { beforeEach, describe, expect, it, vi } from "vitest";

type ErroSupabase = { code: string } | null;

const { createClientMock, redirectMock, revalidatePathMock, resultados, chamadas } = vi.hoisted(
  () => {
    const resultados = {
      insert: { error: null as ErroSupabase },
      update: { data: null as { id: number } | null, error: null as ErroSupabase },
    };
    const chamadas: Array<{ tipo: "insert" | "update"; linha: Record<string, unknown> }> = [];

    const createClientMock = vi.fn(async () => ({
      from: () => ({
        insert: (linha: Record<string, unknown>) => {
          chamadas.push({ tipo: "insert", linha });
          return Promise.resolve(resultados.insert);
        },
        update: (linha: Record<string, unknown>) => {
          chamadas.push({ tipo: "update", linha });
          return {
            eq: () => ({
              select: () => ({ maybeSingle: () => Promise.resolve(resultados.update) }),
            }),
          };
        },
      }),
    }));

    return {
      createClientMock,
      redirectMock: vi.fn(),
      revalidatePathMock: vi.fn(),
      resultados,
      chamadas,
    };
  },
);

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { salvarSite } = await import("./actions");

const LISTAGEM = "/dashboard/cadastros/site-planta";

/** Campos minimos para o formulario passar na validacao. */
const MINIMO = { nome: "Agência Centro", grupo_site_id: "3" };

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

beforeEach(() => {
  vi.clearAllMocks();
  chamadas.length = 0;
  resultados.insert = { error: null };
  resultados.update = { data: { id: 1 }, error: null };
});

describe("salvarSite", () => {
  describe("validação, antes de chegar ao banco", () => {
    it("recusa nome vazio", async () => {
      const estado = await salvarSite({}, formulario({ ...MINIMO, nome: "   " }));

      expect(estado.erro).toBe("Informe o nome do site.");
      expect(chamadas).toHaveLength(0);
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("recusa sem grupo de sites", async () => {
      // `grupo_site_id` e `not null` no banco (migration 0003): sem esta
      // checagem o insert falharia com o texto cru do Postgres.
      const estado = await salvarSite({}, formulario({ nome: "Agência Centro" }));

      expect(estado.erro).toBe("Selecione o grupo de sites.");
      expect(chamadas).toHaveLength(0);
    });

    it("recusa UF que nao tem exatamente duas letras", async () => {
      // `uf` e char(2): um valor maior seria truncado em silencio pelo Postgres
      // e o cadastro sairia com a UF errada.
      const estado = await salvarSite({}, formulario({ ...MINIMO, uf: "RSX" }));

      expect(estado.erro).toContain("exatamente 2 letras");
      expect(chamadas).toHaveLength(0);
    });

    it("devolve o que a pessoa digitou junto do erro", async () => {
      // Sem isto o formulario recarrega vazio e a pessoa redigita tudo.
      const estado = await salvarSite({}, formulario({ ...MINIMO, nome: "", cidade: "Canoas" }));

      expect(estado.valores?.cidade).toBe("Canoas");
    });
  });

  describe("normalização", () => {
    it("cria o site e volta para a listagem", async () => {
      await salvarSite({}, formulario({ ...MINIMO, cidade: "Porto Alegre", uf: "rs" }));

      expect(chamadas).toEqual([
        {
          tipo: "insert",
          linha: expect.objectContaining({
            nome: "Agência Centro",
            grupo_site_id: 3,
            cidade: "Porto Alegre",
            // Minusculas viram maiusculas: `uf` e comparada por igualdade nos
            // relatorios, e "rs" nao casaria com "RS".
            uf: "RS",
            // Campo "status" ausente: ativo por padrao (ver testes abaixo).
            ativo: true,
          }),
        },
      ]);
      expect(revalidatePathMock).toHaveBeenCalledWith(LISTAGEM);
      expect(redirectMock).toHaveBeenCalledWith(LISTAGEM);
    });

    it("converte campo de texto vazio em null, e nao em string vazia", async () => {
      // "" e um valor; null e "nao informado". A tela distingue os dois.
      await salvarSite({}, formulario({ ...MINIMO, sigla: "", regional: "  " }));

      const linha = chamadas[0].linha;
      expect(linha.sigla).toBeNull();
      expect(linha.regional).toBeNull();
    });

    it("status ausente cai em ativo por padrao", async () => {
      // "status" e um Select, nao um checkbox: sem valor no formulario nao
      // quer dizer "desativado", quer dizer que o campo nao foi tocado.
      await salvarSite({}, formulario(MINIMO));

      expect(chamadas[0].linha.ativo).toBe(true);
    });

    it('status "inativo" desativa o site', async () => {
      await salvarSite({}, formulario({ ...MINIMO, status: "inativo" }));

      expect(chamadas[0].linha.ativo).toBe(false);
    });

    it('status "ativo" mantem o site ativo', async () => {
      await salvarSite({}, formulario({ ...MINIMO, status: "ativo" }));

      expect(chamadas[0].linha.ativo).toBe(true);
    });
  });

  describe("erros do banco", () => {
    it("traduz nome duplicado", async () => {
      resultados.insert = { error: { code: "23505" } };

      const estado = await salvarSite({}, formulario(MINIMO));

      expect(estado.erro).toBe("Já existe um site com esse nome neste grupo.");
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("traduz insert barrado pelo RLS", async () => {
      // Mensagem generica faria a pessoa repetir a acao para sempre, porque
      // tentar de novo nao resolve falta de permissao.
      resultados.insert = { error: { code: "42501" } };

      const estado = await salvarSite({}, formulario(MINIMO));

      expect(estado.erro).toBe("Você não tem permissão para cadastrar sites.");
    });

    it("traduz FK apontando para registro que sumiu", async () => {
      resultados.insert = { error: { code: "23503" } };

      const estado = await salvarSite({}, formulario(MINIMO));

      expect(estado.erro).toContain("não existe mais");
    });
  });

  describe("edição", () => {
    it("atualiza quando o id vem no formulario", async () => {
      await salvarSite({}, formulario({ ...MINIMO, id: "42" }));

      expect(chamadas[0].tipo).toBe("update");
      expect(redirectMock).toHaveBeenCalledWith(LISTAGEM);
    });

    it("recusa id que nao e inteiro", async () => {
      const estado = await salvarSite({}, formulario({ ...MINIMO, id: "abc" }));

      expect(estado.erro).toBe("Registro inválido.");
      expect(chamadas).toHaveLength(0);
    });

    /**
     * UPDATE barrado pelo RLS nao devolve erro, devolve zero linhas alteradas.
     * Sem conferir isso, quem nao tem permissao veria sucesso e voltaria para
     * a listagem com o registro intacto.
     */
    it("avisa quando o update nao alterou linha nenhuma", async () => {
      resultados.update = { data: null, error: null };

      const estado = await salvarSite({}, formulario({ ...MINIMO, id: "42" }));

      expect(estado.erro).toContain("não tem permissão para editar este site");
      expect(redirectMock).not.toHaveBeenCalled();
    });
  });
});

/** Campos da migration 0021. */
describe("endereço, hierarquia e códigos", () => {
  it("grava os campos novos", async () => {
    await salvarSite(
      {},
      formulario({
        ...MINIMO,
        cep: "90000-000",
        endereco: "Av. Ipiranga",
        numero: "s/n",
        bairro: "Centro",
        complemento: "Sala 2",
        pais: "Brasil",
        raio_metros: "150",
        cod_cliente: "C-1",
        cod_posto: "P-9",
        filial: "F-3",
        info_adicional_1: "um",
        info_adicional_2: "dois",
      }),
    );

    expect(chamadas.find((c) => c.tipo === "insert")?.linha).toMatchObject({
      cep: "90000-000",
      endereco: "Av. Ipiranga",
      // Texto e nao inteiro: "s/n" e numero de porta legitimo.
      numero: "s/n",
      bairro: "Centro",
      complemento: "Sala 2",
      raio_metros: 150,
      cod_cliente: "C-1",
      cod_posto: "P-9",
      filial: "F-3",
      info_adicional_1: "um",
      info_adicional_2: "dois",
    });
  });

  it("campo em branco vira null, e nao string vazia", async () => {
    await salvarSite({}, formulario(MINIMO));

    expect(chamadas.find((c) => c.tipo === "insert")?.linha).toMatchObject({
      cep: null,
      endereco: null,
      site_superior_id: null,
      raio_metros: null,
    });
  });

  /** `pais` e `not null default 'Brasil'`: em branco cai no default em vez de
   * virar erro por algo que ninguem digitou. */
  it("país em branco cai em Brasil", async () => {
    await salvarSite({}, formulario({ ...MINIMO, pais: "" }));

    expect(chamadas.find((c) => c.tipo === "insert")?.linha).toMatchObject({ pais: "Brasil" });
  });

  it("recusa raio negativo, que o banco aceitaria", async () => {
    const estado = await salvarSite({}, formulario({ ...MINIMO, raio_metros: "-5" }));

    expect(estado.erro).toBe("O raio não pode ser negativo.");
    expect(chamadas).toHaveLength(0);
  });

  it("recusa raio que não é inteiro", async () => {
    const estado = await salvarSite({}, formulario({ ...MINIMO, raio_metros: "12,5" }));

    expect(estado.erro).toContain("número inteiro");
    expect(chamadas).toHaveLength(0);
  });

  /**
   * A constraint da 0021 tambem barra, mas la a mensagem seria o texto cru do
   * Postgres. O select da tela ja exclui o proprio site; isto cobre o POST
   * montado a mao.
   */
  it("recusa o site apontar para si mesmo como superior", async () => {
    const estado = await salvarSite(
      {},
      formulario({ ...MINIMO, id: "42", site_superior_id: "42" }),
    );

    expect(estado.erro).toBe("Um site não pode ser superior de si mesmo.");
    expect(chamadas).toHaveLength(0);
  });

  it("aceita outro site como superior", async () => {
    await salvarSite({}, formulario({ ...MINIMO, id: "42", site_superior_id: "7" }));

    expect(chamadas.find((c) => c.tipo === "update")?.linha).toMatchObject({
      site_superior_id: 7,
    });
  });

  it("recusa texto longo demais nos campos de endereço", async () => {
    const estado = await salvarSite({}, formulario({ ...MINIMO, bairro: "x".repeat(101) }));

    expect(estado.erro).toBe("O bairro deve ter no máximo 100 caracteres.");
    expect(chamadas).toHaveLength(0);
  });

  it("checkbox ausente vira false; presente vira true", async () => {
    await salvarSite({}, formulario({ ...MINIMO, recebe_visita: "on" }));

    expect(chamadas.find((c) => c.tipo === "insert")?.linha).toMatchObject({
      recebe_visita: true,
      gerar_qrcode_automatico: false,
      gerar_registro_coletas: false,
    });
  });
});

/** Coordenadas (migration 0025) -- de volta apos a remocao da 0022. */
describe("latitude e longitude", () => {
  it("em branco vira null", async () => {
    await salvarSite({}, formulario(MINIMO));

    expect(chamadas.find((c) => c.tipo === "insert")?.linha).toMatchObject({
      latitude: null,
      longitude: null,
    });
  });

  it("grava valores validos", async () => {
    await salvarSite(
      {},
      formulario({ ...MINIMO, latitude: "-30.0346", longitude: "-51.2177" }),
    );

    expect(chamadas.find((c) => c.tipo === "insert")?.linha).toMatchObject({
      latitude: -30.0346,
      longitude: -51.2177,
    });
  });

  it("aceita virgula decimal, como o teclado numerico em pt-BR produz", async () => {
    await salvarSite({}, formulario({ ...MINIMO, latitude: "-30,0346" }));

    expect(chamadas.find((c) => c.tipo === "insert")?.linha).toMatchObject({ latitude: -30.0346 });
  });

  it("recusa latitude fora do intervalo -90..90", async () => {
    const estado = await salvarSite({}, formulario({ ...MINIMO, latitude: "91" }));

    expect(estado.erro).toBe("A latitude deve estar entre -90 e 90.");
    expect(chamadas).toHaveLength(0);
  });

  it("recusa longitude fora do intervalo -180..180", async () => {
    const estado = await salvarSite({}, formulario({ ...MINIMO, longitude: "181" }));

    expect(estado.erro).toBe("A longitude deve estar entre -180 e 180.");
    expect(chamadas).toHaveLength(0);
  });

  it("recusa texto que nao e numero", async () => {
    const estado = await salvarSite({}, formulario({ ...MINIMO, latitude: "abc" }));

    expect(estado.erro).toBe("A latitude deve ser um número.");
    expect(chamadas).toHaveLength(0);
  });
});
