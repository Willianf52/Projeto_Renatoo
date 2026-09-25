import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O rascunho do checklist no aparelho.
 *
 * O SQLite entra como duble de uma linha so por visita -- o que se testa e o
 * que acontece com o dado que VOLTA do disco: ele pode estar corrompido, ser
 * de outro inspetor ou apontar para uma foto que o sistema ja apagou.
 */
const estado = vi.hoisted(() => ({
  linhas: new Map<number, { funcionario_id: string; motivo: string; respostas: string; fotos: string }>(),
  arquivosQueExistem: new Set<string>(),
  apagados: [] as string[],
  falharCopia: false,
}));

vi.mock("./fila", () => ({
  abrirFila: async () => ({
    runAsync: async (sql: string, ...args: unknown[]) => {
      if (sql.startsWith("delete")) {
        estado.linhas.delete(args[0] as number);
        return;
      }
      const [visitaId, funcionarioId, motivo, respostas, fotos] = args as [number, string, string, string, string];
      estado.linhas.set(visitaId, { funcionario_id: funcionarioId, motivo, respostas, fotos });
    },
    getFirstAsync: async (_sql: string, visitaId: number, funcionarioId: string) => {
      const linha = estado.linhas.get(visitaId);
      return linha && linha.funcionario_id === funcionarioId ? linha : null;
    },
  }),
}));

vi.mock("expo-file-system", () => {
  const juntar = (partes: unknown[]) =>
    partes.map((p) => (typeof p === "string" ? p : (p as { uri: string }).uri)).join("/");

  class Directory {
    uri: string;
    constructor(...partes: unknown[]) {
      this.uri = juntar(partes);
    }
    get exists() {
      return true;
    }
    create() {}
    delete() {
      estado.apagados.push(this.uri);
    }
  }

  class File {
    uri: string;
    constructor(...partes: unknown[]) {
      this.uri = juntar(partes);
    }
    get exists() {
      return estado.arquivosQueExistem.has(this.uri);
    }
    async copy(destino: File) {
      if (estado.falharCopia) throw new Error("disco cheio");
      estado.arquivosQueExistem.add(destino.uri);
    }
    delete() {
      estado.apagados.push(this.uri);
    }
  }

  return { Directory, File, Paths: { document: "doc" } };
});

const { descartarRascunho, guardarFoto, lerRascunho, salvarRascunho } = await import("./rascunho");

const A = "11111111-2222-4333-8444-555555555555";
const B = "99999999-8888-4777-8666-555555555555";

beforeEach(() => {
  estado.linhas.clear();
  estado.arquivosQueExistem.clear();
  estado.apagados = [];
  estado.falharCopia = false;
});

describe("ida e volta", () => {
  it("devolve o que foi salvo", async () => {
    estado.arquivosQueExistem.add("doc/rascunhos/42/foto-1.jpg");

    await salvarRascunho(42, A, {
      motivo: "Extintor vencido",
      respostas: { 1: "SIM", 2: "NA" },
      fotos: ["doc/rascunhos/42/foto-1.jpg"],
    });

    expect(await lerRascunho(42, A)).toEqual({
      motivo: "Extintor vencido",
      respostas: { 1: "SIM", 2: "NA" },
      fotos: ["doc/rascunhos/42/foto-1.jpg"],
    });
  });

  it("nao entrega o rascunho de outro inspetor no mesmo aparelho", async () => {
    await salvarRascunho(42, A, { motivo: "x", respostas: {}, fotos: [] });

    expect(await lerRascunho(42, B)).toBeNull();
  });
});

describe("o que volta do disco e conferido", () => {
  it("JSON corrompido vira rascunho vazio, e nao excecao", async () => {
    estado.linhas.set(42, { funcionario_id: A, motivo: "m", respostas: "{quebrado", fotos: "nao e json" });

    expect(await lerRascunho(42, A)).toEqual({ motivo: "m", respostas: {}, fotos: [] });
  });

  it("descarta resposta fora do dominio", async () => {
    estado.linhas.set(42, {
      funcionario_id: A,
      motivo: "",
      respostas: JSON.stringify({ 1: "SIM", 2: "TALVEZ", x: "NAO" }),
      fotos: "[]",
    });

    expect((await lerRascunho(42, A))?.respostas).toEqual({ 1: "SIM" });
  });

  it("foto cujo arquivo sumiu nao volta para a tela", async () => {
    estado.arquivosQueExistem.add("doc/rascunhos/42/viva.jpg");
    estado.linhas.set(42, {
      funcionario_id: A,
      motivo: "",
      respostas: "{}",
      fotos: JSON.stringify(["doc/rascunhos/42/viva.jpg", "cache/apagada.jpg"]),
    });

    expect((await lerRascunho(42, A))?.fotos).toEqual(["doc/rascunhos/42/viva.jpg"]);
  });
});

describe("fotos", () => {
  it("copia para a pasta permanente da visita", async () => {
    const uri = await guardarFoto(42, "cache/camera.jpg");

    expect(uri.startsWith("doc/rascunhos/42/")).toBe(true);
    expect(estado.arquivosQueExistem.has(uri)).toBe(true);
  });

  it("copia que falha devolve o endereco original, sem travar o inspetor", async () => {
    estado.falharCopia = true;

    expect(await guardarFoto(42, "cache/camera.jpg")).toBe("cache/camera.jpg");
  });
});

it("descartar apaga a linha e a pasta das fotos", async () => {
  await salvarRascunho(42, A, { motivo: "x", respostas: {}, fotos: [] });

  await descartarRascunho(42);

  expect(await lerRascunho(42, A)).toBeNull();
  expect(estado.apagados).toContain("doc/rascunhos/42");
});
