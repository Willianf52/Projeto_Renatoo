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

    it("recusa coordenada fora do intervalo", async () => {
      const latitude = await salvarSite(
        {},
        formulario({ ...MINIMO, latitude: "91", longitude: "0" }),
      );
      expect(latitude.erro).toContain("A latitude deve estar entre");

      const longitude = await salvarSite(
        {},
        formulario({ ...MINIMO, latitude: "0", longitude: "181" }),
      );
      expect(longitude.erro).toContain("A longitude deve estar entre");

      expect(chamadas).toHaveLength(0);
    });

    it("recusa uma coordenada sem a outra", async () => {
      // Latitude sozinha nao localiza nada, e a tela de coletas mostra o par.
      const estado = await salvarSite({}, formulario({ ...MINIMO, latitude: "-30.03" }));

      expect(estado.erro).toContain("juntas");
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
            ativo: false,
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
      expect(linha.latitude).toBeNull();
      expect(linha.longitude).toBeNull();
    });

    it("aceita virgula como separador decimal", async () => {
      // E o que sai de um teclado em pt-BR; recusar seria pedantismo.
      await salvarSite(
        {},
        formulario({ ...MINIMO, latitude: "-30,0346", longitude: "-51,2177" }),
      );

      expect(chamadas[0].linha.latitude).toBe(-30.0346);
      expect(chamadas[0].linha.longitude).toBe(-51.2177);
    });

    it("marca ativo quando o checkbox vem no formulario", async () => {
      // Checkbox nao marcado nao e enviado pelo navegador: ausencia e false.
      await salvarSite({}, formulario({ ...MINIMO, ativo: "on" }));

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
