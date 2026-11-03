import { describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

vi.mock("server-only", () => ({}));

const getChecklist = vi.fn();
vi.mock("@/app/dashboard/checklistlab/historico-de-checklist/queries", () => ({
  getChecklistPeloCliente: (...args: unknown[]) => getChecklist(...args),
  TIPO_CONSULTORIA: "CONSULTORIA",
}));

const { enderecoDoSite, gerarPdfDoChecklist, nomeDoArquivo, notaComVirgula, paraWinAnsi, pintarPng, quebrarEmLinhas } =
  await import("./pdf-do-checklist");
const UPNGTipos = await import("@pdf-lib/upng");
const UPNG = (UPNGTipos as unknown as { default?: typeof UPNGTipos }).default ?? UPNGTipos;

/** PNG de 1x1 pixel: suficiente para o pdf-lib embutir. */
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

const DETALHE = {
  linha: {
    id: 46,
    numeroAno: "00029/2026",
    checklist: "Consultoria",
    tipo: "CONSULTORIA",
    totalPerguntas: 2,
    modelo: "Cooperativa de Crédito",
    site: "Posto Central",
    responsavel: "Ana Souza",
    nota: 91,
    enviadoEm: "2026-11-03T03:42:21Z",
  },
  visitaId: 113,
  respostas: [
    {
      perguntaId: 10,
      ordem: 1,
      pergunta: "Uniformes da equipe de limpeza",
      valor: "NAO",
      tipo: "CNA",
      resposta: "Não conforme",
      observacao: "Camisa rasgada 😕",
      fotos: [{ id: 1, criadoEm: "" }],
    },
    { perguntaId: 11, ordem: 2, pergunta: "Dúvidas com o RH", valor: "NAO", tipo: "SN", resposta: "Não", observacao: null, fotos: [] },
  ],
  fotos: [{ id: 2, criadoEm: "" }, { id: 3, criadoEm: "" }],
  motivoDaCorretiva: null,
};

/** Banco falso: so as duas consultas e o download que o gerador usa. */
function bancoFalso(arquivos: Record<string, Uint8Array>) {
  return {
    from: (tabela: string) => ({
      select: () => ({
        eq: () =>
          tabela === "checklist_fotos"
            ? {
                order: async () => ({
                  data: [
                    { id: 1, storage_path: "113/foto-1.jpg", pergunta_id: 10 },
                    { id: 2, storage_path: "113/foto-2.jpg", pergunta_id: null },
                    // Nao e imagem: fica de fora sem derrubar o PDF.
                    { id: 3, storage_path: "113/foto-3.jpg", pergunta_id: null },
                  ],
                }),
              }
            : tabela === "visitas"
              ? {
                  maybeSingle: async () => ({
                    data: {
                      id: 113,
                      criado_em: "2026-11-03T03:41:33Z",
                      sites: { nome: "Posto Central", endereco: null, numero: null, bairro: null, cidade: "São Paulo", uf: "SP" },
                      leituras: [{ data_hora: "2026-11-03T03:41:33Z", qr_code_id: 601, area_id: null }],
                    },
                  }),
                }
              : { maybeSingle: async () => ({ data: { assinatura_path: "113/assinatura.png", criado_em: "2026-11-03T03:42:21Z" } }) },
      }),
    }),
    storage: {
      from: () => ({
        download: async (caminho: string) =>
          caminho in arquivos ? { data: new Blob([arquivos[caminho] as BlobPart]), error: null } : { data: null, error: new Error("404") },
      }),
    },
  } as never;
}

describe("paraWinAnsi", () => {
  it("troca a seta e as aspas curvas e tira o que a Helvetica nao desenha", () => {
    expect(paraWinAnsi("Rede → Agência “A” – ok 😕")).toBe('Rede > Agência "A" - ok ');
  });
});

describe("quebrarEmLinhas", () => {
  it("quebra pela largura e respeita a quebra digitada", async () => {
    const fonte = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const linhas = quebrarEmLinhas("uma frase bem comprida que nao cabe\nsegunda", fonte, 10, 80);

    expect(linhas.length).toBeGreaterThan(2);
    expect(linhas.at(-1)).toBe("segunda");
    for (const linha of linhas) expect(fonte.widthOfTextAtSize(linha, 10)).toBeLessThanOrEqual(80);
  });
});

describe("gerarPdfDoChecklist", () => {
  it("gera um PDF valido com as fotos que sao imagem e a assinatura", async () => {
    getChecklist.mockResolvedValue(DETALHE);
    const admin = bancoFalso({
      "113/foto-1.jpg": PNG,
      "113/foto-2.jpg": PNG,
      "113/foto-3.jpg": new TextEncoder().encode("<html>nao e foto</html>"),
      "113/assinatura.png": PNG,
    });

    const pdf = await gerarPdfDoChecklist(admin, 46);

    expect(pdf?.nome).toBe("checklist-00029-2026.pdf");
    const lido = await PDFDocument.load(pdf!.arquivo);
    expect(lido.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(lido.getTitle()).toBe("Posto Central 00029/2026");
  });

  it("checklist que nao existe devolve null", async () => {
    getChecklist.mockResolvedValue(null);
    expect(await gerarPdfDoChecklist(bancoFalso({}), 999)).toBeNull();
  });
});

describe("pintarPng", () => {
  it("pinta o traco branco da assinatura e mantem o transparente", () => {
    const rgba = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 0]);
    const png = new Uint8Array(UPNG.encode([rgba.buffer], 2, 1, 0));

    const pintado = new Uint8Array(UPNG.toRGBA8(UPNG.decode(pintarPng(png, { r: 26, g: 79, b: 176 }).slice().buffer))[0]);

    expect([...pintado.slice(0, 4)]).toEqual([26, 79, 176, 255]);
    expect(pintado[7]).toBe(0);
  });
});

describe("cabecalho no formato do antigo", () => {
  it("nota com virgula e endereco sem as partes vazias", () => {
    expect(notaComVirgula(100)).toBe("100,00");
    expect(notaComVirgula(91)).toBe("91,00");
    expect(enderecoDoSite({ endereco: null, numero: null, bairro: null, cidade: "São Paulo", uf: "SP" })).toBe("São Paulo, SP");
    expect(enderecoDoSite({ endereco: "Rua A", numero: "10", bairro: "Centro", cidade: "Barueri", uf: "SP" })).toBe(
      "Rua A, 10 - Centro, Barueri, SP",
    );
  });
});

describe("nomeDoArquivo", () => {
  it("sem Numero/Ano, usa o id", () => {
    expect(nomeDoArquivo({ linha: { id: 46, numeroAno: "" } as never })).toBe("checklist-46.pdf");
  });
});
