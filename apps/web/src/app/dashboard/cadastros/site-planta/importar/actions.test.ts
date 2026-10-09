import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O Importar sites: o que a action faz com o arquivo, com a pre-visualizacao e
 * com a gravacao em niveis. O planejador (`importacao.ts`) e testado a parte;
 * o banco e a permissao entram como duble.
 */
type Chamada = { tipo: "insert" | "update"; dados: unknown; ids?: number[] };

const { estado, revalidatePathMock } = vi.hoisted(() => ({
  estado: {
    podeAdministrar: true,
    sites: [] as { id: number; nome: string; grupo_site_id: number; regional: string | null; site_superior_id: number | null }[],
    grupos: [{ id: 1, nome: "UP Serviços" }, { id: 2, nome: "SICREDI" }] as { id: number; nome: string }[],
    pessoas: [] as { id: string; email: string }[],
    tipos: [] as { id: number; nome: string }[],
    erroDaLeitura: null as { message: string } | null,
    erroDoInsert: null as { code: string } | null,
    atualizadosPorVez: null as number | null,
    chamadas: [] as Chamada[],
    proximoId: 100,
  },
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));
vi.mock("@/lib/permissoes", () => ({ podeAdministrarCadastros: async () => estado.podeAdministrar }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => ({
      select: () => {
        const dados = () =>
          tabela === "sites"
            ? estado.sites
            : tabela === "grupos_sites"
              ? estado.grupos
              : tabela === "profiles"
                ? estado.pessoas
                : estado.tipos;
        const consulta = {
          eq: () => consulta,
          order: () => consulta,
          range: async (de: number) => ({ data: de === 0 ? dados() : [], error: estado.erroDaLeitura }),
        };
        return consulta;
      },
      insert: (linhas: { nome: string; grupo_site_id: number }[]) => ({
        select: async () => {
          if (estado.erroDoInsert) return { data: null, error: estado.erroDoInsert };
          estado.chamadas.push({ tipo: "insert", dados: linhas });
          return {
            data: linhas.map((l) => ({ id: estado.proximoId++, nome: l.nome, grupo_site_id: l.grupo_site_id })),
            error: null,
          };
        },
      }),
      update: (alteracao: unknown) => ({
        in: (_coluna: string, ids: number[]) => ({
          select: async () => {
            estado.chamadas.push({ tipo: "update", dados: alteracao, ids });
            const quantos = estado.atualizadosPorVez ?? ids.length;
            return { data: ids.slice(0, quantos).map((id) => ({ id })), error: null };
          },
        }),
      }),
    }),
  }),
}));

const { importarSites } = await import("./actions");

const CABECALHO = "id;site_superior_id;regional;nome;grupo_sites_nome";

function envio(linhas: string[], opcoes: { modo?: string; nome?: string; conteudo?: string | Uint8Array<ArrayBuffer> } = {}) {
  const formData = new FormData();
  formData.set("arquivo", new File([opcoes.conteudo ?? [CABECALHO, ...linhas].join("\r\n")], opcoes.nome ?? "sites.csv"));
  if (opcoes.modo) formData.set("modo", opcoes.modo);
  return importarSites({}, formData);
}

beforeEach(() => {
  estado.podeAdministrar = true;
  estado.sites = [];
  estado.pessoas = [];
  estado.tipos = [];
  estado.erroDaLeitura = null;
  estado.erroDoInsert = null;
  estado.atualizadosPorVez = null;
  estado.chamadas = [];
  estado.proximoId = 100;
  revalidatePathMock.mockReset();
});

// Raiz (ja no portal) -> Filho novo -> Neto novo.
const ARQUIVO = ["1;0;SP;UP Serviços;UP Serviços", "2;1;SP;Filho;SICREDI", "3;2;SP;Neto;SICREDI"];

describe("importarSites: pre-visualizacao", () => {
  it("sem pedir 'importar', mostra o plano e NAO grava nada", async () => {
    estado.sites = [{ id: 10, nome: "UP Serviços", grupo_site_id: 1, regional: null, site_superior_id: null }];

    const resultado = await importarSites({}, formularioCom(ARQUIVO));

    expect(resultado.previa).toEqual({
      novos: [
        { linha: 3, nome: "Filho", grupo: "SICREDI", superior: "UP Serviços" },
        { linha: 4, nome: "Neto", grupo: "SICREDI", superior: "Filho" },
      ],
      completar: [{ linha: 2, nome: "UP Serviços", regional: "SP", superior: null }],
      semMudanca: 0,
      semResponsavel: 0,
    });
    expect(estado.chamadas).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("com erro na planilha, nao mostra previa nem grava: devolve as linhas com problema", async () => {
    const resultado = await envio(["1;0;SP;Solto;Grupo Que Nao Existe"]);

    expect(resultado.erro).toBe("Nenhum site foi importado. Corrija as linhas abaixo e envie o arquivo de novo.");
    expect(resultado.erros).toEqual([{ linha: 2, mensagem: "Grupo não encontrado no portal: Grupo Que Nao Existe." }]);
    expect(resultado.previa).toBeUndefined();
    expect(estado.chamadas).toEqual([]);
  });
});

describe("importarSites: gravacao", () => {
  it("cria nivel a nivel (o pai antes do filho) e completa o que ja existia", async () => {
    estado.sites = [{ id: 10, nome: "UP Serviços", grupo_site_id: 1, regional: null, site_superior_id: null }];

    const resultado = await importarSites({}, formularioCom(ARQUIVO, "importar"));

    expect(resultado).toEqual({ resultado: { criados: 2, completados: 1 } });

    const [primeiro, segundo, terceiro] = estado.chamadas;
    // Filho: o pai ja existe no portal (id 10).
    expect(primeiro.tipo).toBe("insert");
    expect(primeiro.dados).toMatchObject([{ nome: "Filho", grupo_site_id: 2, site_superior_id: 10 }]);
    // Neto: o pai acabou de ser criado (id 100).
    expect(segundo.dados).toMatchObject([{ nome: "Neto", site_superior_id: 100 }]);
    // O que ja existia so ganha a regional.
    expect(terceiro).toEqual({ tipo: "update", dados: { regional: "SP" }, ids: [10] });

    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/cadastros/site-planta");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/cadastros/grupo-de-sites");
  });

  it("existente completado com superior NOVO usa o id que acabou de nascer", async () => {
    estado.sites = [{ id: 10, nome: "Filho", grupo_site_id: 2, regional: "SP", site_superior_id: null }];

    await importarSites({}, formularioCom(["1;0;SP;UP Serviços;UP Serviços", "2;1;SP;Filho;SICREDI"], "importar"));

    expect(estado.chamadas.map((c) => c.tipo)).toEqual(["insert", "update"]);
    expect(estado.chamadas[1]).toEqual({ tipo: "update", dados: { site_superior_id: 100 }, ids: [10] });
  });

  it("agrupa os updates iguais num so", async () => {
    estado.sites = [
      { id: 10, nome: "A", grupo_site_id: 1, regional: null, site_superior_id: null },
      { id: 11, nome: "B", grupo_site_id: 1, regional: null, site_superior_id: null },
    ];

    await importarSites({}, formularioCom(["1;0;SP;A;UP Serviços", "2;0;SP;B;UP Serviços"], "importar"));

    expect(estado.chamadas).toEqual([{ tipo: "update", dados: { regional: "SP" }, ids: [10, 11] }]);
  });

  it("arquivo todo ja completo: nada a gravar, sem chamada ao banco", async () => {
    estado.sites = [{ id: 10, nome: "A", grupo_site_id: 1, regional: "SP", site_superior_id: null }];

    const resultado = await importarSites({}, formularioCom(["1;0;SP;A;UP Serviços"], "importar"));

    expect(resultado).toEqual({ resultado: { criados: 0, completados: 0 } });
    expect(estado.chamadas).toEqual([]);
  });

  it("insert recusado: traduz o erro e nao mostra sucesso", async () => {
    estado.erroDoInsert = { code: "42501" };

    const resultado = await importarSites({}, formularioCom(["1;0;SP;Novo;SICREDI"], "importar"));

    expect(resultado).toEqual({ erro: "Você não tem permissão para cadastrar sites." });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("UPDATE barrado pelo RLS (zero linhas) vira erro, e a mensagem conta o que ja entrou", async () => {
    estado.sites = [{ id: 10, nome: "A", grupo_site_id: 1, regional: null, site_superior_id: null }];
    estado.atualizadosPorVez = 0;

    const resultado = await importarSites({}, formularioCom(["1;0;SP;A;UP Serviços", "2;0;SP;Novo;SICREDI"], "importar"));

    expect(resultado.erro).toContain("Você não tem permissão para cadastrar sites.");
    expect(resultado.erro).toContain("A importação parou no meio (1 site criado, 0 completados)");
    expect(resultado.resultado).toBeUndefined();
  });
});

describe("importarSites: o arquivo e a permissao", () => {
  it("sem permissao, nem le o arquivo", async () => {
    estado.podeAdministrar = false;

    expect(await envio([])).toEqual({ erro: "Você não tem permissão para cadastrar sites." });
  });

  it("recusa arquivo ausente, que nao e .csv ou grande demais", async () => {
    expect(await importarSites({}, new FormData())).toEqual({ erro: "Escolha o arquivo .csv com os sites." });
    expect((await envio([], { nome: "sites.xlsx" })).erro).toMatch(/precisa ser \.csv/);
    expect((await envio([], { conteudo: new Uint8Array(512 * 1024 + 1) })).erro).toBe(
      "O arquivo passa de 512 KB. Divida em arquivos menores.",
    );
  });

  it("le o CSV em Windows-1252, como o Excel em pt-BR grava", async () => {
    // "Hiraço" em Windows-1252: o ç e o byte 0xE7, que nao e UTF-8 valido.
    const bytes = Uint8Array.from([...new TextEncoder().encode("nome;grupo_sites_nome\r\nHira"), 0xe7, ...new TextEncoder().encode("o;SICREDI\r\n")]);

    const resultado = await envio([], { conteudo: bytes });

    expect(resultado.previa?.novos).toEqual([{ linha: 2, nome: "Hiraço", grupo: "SICREDI", superior: null }]);
  });

  it("falha ao ler o que ja existe: erro generico, sem plano", async () => {
    estado.erroDaLeitura = { message: "boom" };

    expect(await envio(["1;0;SP;A;SICREDI"])).toEqual({ erro: "Não foi possível importar os sites. Tente novamente." });
  });
});

function formularioCom(linhas: string[], modo?: string): FormData {
  const formData = new FormData();
  formData.set("arquivo", new File([[CABECALHO, ...linhas].join("\r\n")], "sites.csv"));
  if (modo) formData.set("modo", modo);
  return formData;
}
