import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  resultado: { rows: [] as unknown[], truncado: false },
  busca: undefined as string | undefined,
}));

vi.mock("../../queries", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("../../queries")>()),
  getGruposSitesParaExportar: async (busca: string | undefined) => {
    estado.busca = busca;
    return estado.resultado;
  },
}));

const { GET } = await import("./route");

/** `Response.text()` descarta o BOM ao decodificar, entao ele so se ve nos bytes. */
async function lerCorpo(resposta: Response): Promise<{ temBom: boolean; linhas: string[] }> {
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  const temBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const texto = new TextDecoder("utf-8").decode(bytes);
  return { temBom, linhas: texto.split("\r\n").filter(Boolean) };
}

beforeEach(() => {
  estado.busca = undefined;
  estado.resultado = { rows: [], truncado: false };
});

describe("GET /export/excel", () => {
  it("cabecalho com a coluna Sites e uma linha por grupo", async () => {
    estado.resultado = {
      rows: [
        {
          id: 9220,
          nome: "ACE Limpeza",
          descricao: null,
          ativo: true,
          sites: [{ nome: "ACE Limpeza", ativo: true }],
        },
        {
          id: 9418,
          nome: "SICA",
          descricao: "Filiais",
          ativo: false,
          sites: [
            { nome: "Sicredi Osasco", ativo: true },
            { nome: "Sicredi Cotia", ativo: true },
          ],
        },
      ],
      truncado: false,
    };

    const resposta = await GET(new Request("http://x/export/excel?busca=sic"));
    const { temBom, linhas } = await lerCorpo(resposta);

    expect(estado.busca).toBe("sic");
    expect(resposta.headers.get("Content-Disposition")).toBe('attachment; filename="grupo-de-sites.csv"');
    // O BOM continua: sem ele o Excel em pt-BR le o UTF-8 como ANSI e estraga os acentos.
    expect(temBom).toBe(true);
    expect(linhas).toEqual([
      '"ID";"Nome";"Status";"Descrição";"Sites"',
      '"9220";"ACE Limpeza";"Ativo";"";"ACE Limpeza;"',
      '"9418";"SICA";"Inativo";"Filiais";"Sicredi Cotia;Sicredi Osasco;"',
    ]);
  });

  it("resultado truncado ganha a linha de aviso, com as cinco colunas", async () => {
    estado.resultado = { rows: [], truncado: true };

    const { linhas } = await lerCorpo(await GET(new Request("http://x/export/excel")));

    expect(linhas[1]).toBe('"…";"Resultado truncado: ajuste os filtros para reduzir o total";"";"";""');
  });
});
