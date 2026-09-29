import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A ronda com leitor de QR. A fila (SQLite) e o Supabase entram como duble: o
 * que se testa e a decisao -- abrir, somar, trocar de site, recusar -- e a
 * traducao do codigo lido, local ou pela rede.
 */
const estado = vi.hoisted(() => ({
  catalogo: new Map<string, { codigo: string; id: number; site_id: number; site_nome: string; finalidade: string | null; ativo: number }>(),
  servidor: null as null | { data: unknown; error: unknown },
  servidorLanca: false,
  visitasIniciadas: [] as { siteId: number; funcionarioId: string }[],
  leituras: [] as { chaveDaVisita: string; qrCodeId?: number | null }[],
  leituraRepetida: false,
  /** Quantas leituras do QR a fila tem na janela recente da ronda. */
  leiturasRecentes: 0,
  consultasRecentes: [] as unknown[][],
}));

vi.mock("./fila", () => ({
  abrirFila: async () => ({
    getFirstAsync: async (sql: string, ...args: unknown[]) => {
      if (sql.includes("leituras_na_fila")) {
        estado.consultasRecentes.push(args);
        return { n: estado.leiturasRecentes };
      }
      return estado.catalogo.get(args[0] as string) ?? null;
    },
    runAsync: async (_sql: string, codigo: string, id: number, siteId: number, siteNome: string, finalidade: string | null, ativo: number) => {
      estado.catalogo.set(codigo, { codigo, id, site_id: siteId, site_nome: siteNome, finalidade, ativo });
    },
  }),
  iniciarVisita: async (entrada: { siteId: number; funcionarioId: string }) => {
    estado.visitasIniciadas.push(entrada);
    return `chave-nova-${entrada.siteId}`;
  },
  registrarLeitura: async (entrada: { chaveDaVisita: string; qrCodeId?: number | null }) => {
    estado.leituras.push(entrada);
    return !estado.leituraRepetida;
  },
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (estado.servidorLanca) throw new Error("Network request failed");
            return estado.servidor ?? { data: null, error: null };
          },
        }),
      }),
    }),
  },
}));

const {
  JANELA_POR_CODIGO_MS,
  PAUSA_ENTRE_LEITURAS_MS,
  aceitarDaCamera,
  acharQr,
  decidirLeitura,
  novaMemoriaDaCamera,
  normalizarCodigo,
  registrarLeituraDeQr,
} = await import("./ronda");

const QR = { id: 7, codigo: "PL-286834", siteId: 30, siteNome: "Posto Central", finalidade: "Portaria", ativo: true };
const ABERTA = { chave: "chave-aberta", siteId: 30, siteNome: "Posto Central", leituras: 2, capturadoEm: "2026-09-25T10:00:00Z" };

beforeEach(() => {
  estado.catalogo.clear();
  estado.servidor = null;
  estado.servidorLanca = false;
  estado.visitasIniciadas = [];
  estado.leituras = [];
  estado.leituraRepetida = false;
  estado.leiturasRecentes = 0;
  estado.consultasRecentes = [];
});

describe("decidirLeitura", () => {
  it("sem ronda aberta, a leitura abre uma", () => {
    expect(decidirLeitura(null, QR)).toEqual({ tipo: "iniciar" });
  });

  it("QR do mesmo site soma na ronda aberta", () => {
    expect(decidirLeitura(ABERTA, QR)).toEqual({ tipo: "adicionar" });
  });

  it("QR de outro site pede para trocar -- a tela confirma com o inspetor", () => {
    expect(decidirLeitura(ABERTA, { ...QR, siteId: 99 })).toEqual({ tipo: "trocar-de-site" });
  });

  it("QR desativado e recusado, com ou sem ronda aberta", () => {
    for (const aberta of [null, ABERTA]) {
      expect(decidirLeitura(aberta, { ...QR, ativo: false })).toMatchObject({ tipo: "recusar" });
    }
  });
});

describe("normalizarCodigo", () => {
  it("tira espaco e quebra de linha das pontas, e preserva a caixa", () => {
    expect(normalizarCodigo("  PL-286834\n")).toBe("PL-286834");
  });
});

describe("acharQr", () => {
  it("acha no catalogo do aparelho sem ir a rede", async () => {
    estado.catalogo.set("PL-286834", { codigo: "PL-286834", id: 7, site_id: 30, site_nome: "Posto Central", finalidade: null, ativo: 1 });
    estado.servidorLanca = true; // se fosse a rede, lancaria

    expect(await acharQr("PL-286834")).toMatchObject({ id: 7, siteId: 30, ativo: true });
  });

  it("fora do catalogo, busca no servidor e guarda para a proxima", async () => {
    estado.servidor = {
      data: { id: 8, codigo: "PL-9", site_id: 31, finalidade: null, ativo: true, sites: { nome: "SIC" } },
      error: null,
    };

    expect(await acharQr("PL-9")).toMatchObject({ id: 8, siteNome: "SIC" });
    expect(estado.catalogo.has("PL-9")).toBe(true);
  });

  it("sem rede e fora do catalogo, devolve null em vez de lancar", async () => {
    estado.servidorLanca = true;
    expect(await acharQr("PL-desconhecido")).toBeNull();
  });

  it("codigo vazio nem consulta", async () => {
    expect(await acharQr("   ")).toBeNull();
  });
});

describe("registrarLeituraDeQr", () => {
  it("sem ronda aberta, cria a visita no site do QR e grava a leitura com o id do QR", async () => {
    const resultado = await registrarLeituraDeQr({ funcionarioId: "u1", qr: QR, aberta: null });

    expect(estado.visitasIniciadas).toEqual([expect.objectContaining({ siteId: 30, funcionarioId: "u1" })]);
    expect(estado.leituras).toEqual([expect.objectContaining({ chaveDaVisita: "chave-nova-30", qrCodeId: 7 })]);
    expect(resultado).toEqual({ chave: "chave-nova-30", nova: true, repetida: false });
  });

  it("com ronda aberta no mesmo site, soma sem criar visita", async () => {
    const resultado = await registrarLeituraDeQr({ funcionarioId: "u1", qr: QR, aberta: ABERTA });

    expect(estado.visitasIniciadas).toEqual([]);
    expect(resultado).toEqual({ chave: "chave-aberta", nova: false, repetida: false });
  });

  it("o mesmo QR ja lido nesta ronda no ultimo minuto e recusado pela fila -- mesmo com a tela reaberta", async () => {
    // O caso do teste de 28/09: a memoria da camera zerou com a tela reaberta
    // e o mesmo QR entrou 4 vezes em 32 s. A fila e a trava que vale.
    estado.leiturasRecentes = 1;
    const agora = new Date("2026-09-28T12:55:10Z");

    const resultado = await registrarLeituraDeQr({ funcionarioId: "u1", qr: QR, aberta: ABERTA, agora });

    expect(resultado).toEqual({ chave: "chave-aberta", nova: false, repetida: true });
    expect(estado.leituras).toEqual([]);
    // Consulta pela ronda, pelo QR e pela janela de 60 s para tras.
    expect(estado.consultasRecentes).toEqual([["chave-aberta", 7, "2026-09-28T12:54:10.000Z"]]);
  });

  it("ronda nova nem consulta a janela: nao ha leitura anterior nela", async () => {
    await registrarLeituraDeQr({ funcionarioId: "u1", qr: QR, aberta: null });
    expect(estado.consultasRecentes).toEqual([]);
  });

  it("avisa quando a fila recusou por ser a mesma leitura", async () => {
    estado.leituraRepetida = true;
    expect((await registrarLeituraDeQr({ funcionarioId: "u1", qr: QR, aberta: ABERTA })).repetida).toBe(true);
  });
});

describe("aceitarDaCamera", () => {
  it("dois QR na mesma tela nao viram rajada -- o caso do primeiro teste real (~160 leituras em 6 s)", () => {
    const memoria = novaMemoriaDaCamera();
    let aceitas = 0;

    // A camera alternando entre os dois codigos a cada 30 ms, por 6 segundos.
    for (let t = 0; t < 6000; t += 30) {
      if (aceitarDaCamera(memoria, t % 60 === 0 ? "TESTE-RONDA-1" : "TESTE-RONDA-2", t)) aceitas += 1;
    }

    expect(aceitas).toBe(2);
  });

  it("o mesmo codigo fica ignorado pela janela inteira", () => {
    const memoria = novaMemoriaDaCamera();
    expect(aceitarDaCamera(memoria, "PL-1", 0)).toBe(true);
    expect(aceitarDaCamera(memoria, "PL-1", JANELA_POR_CODIGO_MS - 1)).toBe(false);
    expect(aceitarDaCamera(memoria, "PL-1", JANELA_POR_CODIGO_MS)).toBe(true);
  });

  it("codigos diferentes esperam a pausa minima entre si", () => {
    const memoria = novaMemoriaDaCamera();
    expect(aceitarDaCamera(memoria, "PL-1", 0)).toBe(true);
    expect(aceitarDaCamera(memoria, "PL-2", PAUSA_ENTRE_LEITURAS_MS - 1)).toBe(false);
    expect(aceitarDaCamera(memoria, "PL-2", PAUSA_ENTRE_LEITURAS_MS)).toBe(true);
  });

  it("espaco nas pontas nao engana a janela", () => {
    const memoria = novaMemoriaDaCamera();
    expect(aceitarDaCamera(memoria, "PL-1", 0)).toBe(true);
    expect(aceitarDaCamera(memoria, " PL-1 ", 5000)).toBe(false);
  });
});
