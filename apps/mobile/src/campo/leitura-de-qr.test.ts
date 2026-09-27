import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A leitura de QR: o que vai para a fila, e o que a tela recebe de volta.
 *
 * Os dubles ficam nas tres fronteiras que o modulo toca -- a consulta a
 * `qr_codes`, a fila SQLite e a drenagem. O que se prova e a ORDEM (fila antes
 * da rede) e que nada entra na fila quando o codigo nao confere.
 */
const { estado } = vi.hoisted(() => ({
  estado: {
    respostaDoQr: { data: null, error: null } as {
      data: { id: number; site_id: number; ativo: boolean } | null;
      error: { message: string } | null;
    },
    codigoConsultado: null as string | null,
    passos: [] as string[],
    idNoServidor: null as number | null,
    falhasDaDrenagem: [] as { chave: string; erro: string }[],
    drenagemRejeita: false,
  },
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_coluna: string, valor: string) => {
          estado.codigoConsultado = valor;
          return {
            limit: () => ({ maybeSingle: async () => estado.respostaDoQr }),
          };
        },
      }),
    }),
  },
}));

vi.mock("./fila", () => ({
  iniciarVisita: vi.fn(async () => {
    estado.passos.push("iniciarVisita");
    return "chave-1";
  }),
  registrarLeitura: vi.fn(async () => {
    estado.passos.push("registrarLeitura");
    return true;
  }),
  idDaVisitaNoServidor: vi.fn(async () => estado.idNoServidor),
}));

vi.mock("./sincronizacao", () => ({
  sincronizar: vi.fn(async () => {
    estado.passos.push("sincronizar");
    if (estado.drenagemRejeita) throw new Error("rede");
    return {
      visitasCriadas: 1,
      visitasJaExistiam: 0,
      leiturasCriadas: 1,
      leiturasJaExistiam: 0,
      falhas: estado.falhasDaDrenagem,
    };
  }),
}));

import { iniciarVisita, registrarLeitura } from "./fila";
import { registrarLeituraDeQr } from "./leitura-de-qr";

beforeEach(() => {
  vi.clearAllMocks();
  estado.respostaDoQr = { data: { id: 7, site_id: 3, ativo: true }, error: null };
  estado.codigoConsultado = null;
  estado.passos = [];
  estado.idNoServidor = 42;
  estado.falhasDaDrenagem = [];
  estado.drenagemRejeita = false;
});

describe("registrarLeituraDeQr", () => {
  it("grava na fila antes de drenar e devolve a visita criada no servidor", async () => {
    const resultado = await registrarLeituraDeQr("  ABC-1 \n", "usuario-1");

    expect(estado.codigoConsultado).toBe("ABC-1");
    expect(estado.passos).toEqual(["iniciarVisita", "registrarLeitura", "sincronizar"]);
    expect(iniciarVisita).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 3, funcionarioId: "usuario-1" }),
    );
    expect(registrarLeitura).toHaveBeenCalledWith(
      expect.objectContaining({ chaveDaVisita: "chave-1", qrCodeId: 7 }),
    );
    expect(resultado).toEqual({ tipo: "pronta", visitaId: 42, numeroColeta: "chave-1" });
  });

  it("usa o mesmo instante, com fuso, na visita e na leitura", async () => {
    await registrarLeituraDeQr("ABC-1", "usuario-1");

    const capturadoEm = vi.mocked(iniciarVisita).mock.calls[0][0].capturadoEm;
    const dataHora = vi.mocked(registrarLeitura).mock.calls[0][0].dataHora;
    expect(capturadoEm).toBe(dataHora);
    expect(capturadoEm).toMatch(/Z$/);
  });

  it("recusa codigo vazio sem consultar nem gravar", async () => {
    const resultado = await registrarLeituraDeQr("   ", "usuario-1");

    expect(resultado.tipo).toBe("recusada");
    expect(estado.codigoConsultado).toBeNull();
    expect(estado.passos).toEqual([]);
  });

  it("recusa codigo que nao esta cadastrado, sem gravar na fila", async () => {
    estado.respostaDoQr = { data: null, error: null };

    const resultado = await registrarLeituraDeQr("NAO-EXISTE", "usuario-1");

    expect(resultado).toEqual({
      tipo: "recusada",
      mensagem: 'O código "NAO-EXISTE" não está cadastrado.',
    });
    expect(estado.passos).toEqual([]);
  });

  it("recusa codigo desativado, sem gravar na fila", async () => {
    estado.respostaDoQr = { data: { id: 7, site_id: 3, ativo: false }, error: null };

    const resultado = await registrarLeituraDeQr("ABC-1", "usuario-1");

    expect(resultado.tipo).toBe("recusada");
    expect(estado.passos).toEqual([]);
  });

  it("sem rede para conferir o codigo, recusa sem gravar", async () => {
    estado.respostaDoQr = { data: null, error: { message: "Network request failed" } };

    const resultado = await registrarLeituraDeQr("ABC-1", "usuario-1");

    expect(resultado.tipo).toBe("recusada");
    expect(estado.passos).toEqual([]);
  });

  it("quando a drenagem cai, a leitura fica na fila e a tela diz isso", async () => {
    estado.drenagemRejeita = true;
    estado.idNoServidor = null;

    const resultado = await registrarLeituraDeQr("ABC-1", "usuario-1");

    expect(estado.passos).toEqual(["iniciarVisita", "registrarLeitura", "sincronizar"]);
    expect(resultado.tipo).toBe("na-fila");
  });

  it("quando o servidor recusa esta visita, o motivo chega a tela", async () => {
    estado.idNoServidor = null;
    estado.falhasDaDrenagem = [{ chave: "chave-1", erro: "new row violates row-level security policy" }];

    const resultado = await registrarLeituraDeQr("ABC-1", "usuario-1");

    expect(resultado).toEqual({
      tipo: "na-fila",
      mensagem:
        "Leitura salva no aparelho, mas o envio falhou: new row violates row-level security policy",
    });
  });
});
