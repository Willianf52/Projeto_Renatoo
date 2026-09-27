import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Os dois modulos nativos entram por duble: `expo` decide se o manipulador
 * existe no APK, e `expo-image-manipulator` faz o trabalho. O que se prova
 * aqui e a decisao (reduzir ou nao, qual lado) e a falha aberta -- nunca
 * perder a foto por causa da reducao.
 */
const { estado, capturarErro } = vi.hoisted(() => ({
  estado: {
    moduloPresente: true,
    largura: 4032,
    altura: 3024,
    falharAoSalvar: false,
    redimensionamentos: [] as unknown[],
  },
  capturarErro: vi.fn(),
}));

vi.mock("expo", () => ({
  requireOptionalNativeModule: () => (estado.moduloPresente ? {} : null),
}));

vi.mock("./observabilidade", () => ({ capturarErro }));

vi.mock("expo-image-manipulator", () => {
  const imagem = {
    width: 0,
    height: 0,
    saveAsync: async () => {
      if (estado.falharAoSalvar) throw new Error("disco cheio");
      return { uri: "cache/reduzida.jpg", width: 0, height: 0 };
    },
  };

  const contexto = {
    resize: (tamanho: unknown) => {
      estado.redimensionamentos.push(tamanho);
      return contexto;
    },
    renderAsync: async () => ({ ...imagem, width: estado.largura, height: estado.altura }),
  };

  return {
    ImageManipulator: { manipulate: () => contexto },
    SaveFormat: { JPEG: "jpeg" },
  };
});

const { reduzirFoto, tamanhoReduzido, LADO_MAIOR_DA_FOTO } = await import("./reduzir-foto");

beforeEach(() => {
  estado.moduloPresente = true;
  estado.largura = 4032;
  estado.altura = 3024;
  estado.falharAoSalvar = false;
  estado.redimensionamentos = [];
  capturarErro.mockReset();
});

describe("tamanhoReduzido", () => {
  it("limita a largura numa foto deitada", () => {
    expect(tamanhoReduzido(4032, 3024)).toEqual({ width: LADO_MAIOR_DA_FOTO });
  });

  it("limita a altura numa foto em pe", () => {
    expect(tamanhoReduzido(3024, 4032)).toEqual({ height: LADO_MAIOR_DA_FOTO });
  });

  it("nao mexe numa foto que ja cabe", () => {
    expect(tamanhoReduzido(1600, 1200)).toBeNull();
  });
});

describe("reduzirFoto", () => {
  it("devolve a foto reduzida", async () => {
    expect(await reduzirFoto("cache/camera.jpg")).toBe("cache/reduzida.jpg");
    expect(estado.redimensionamentos).toEqual([{ width: LADO_MAIOR_DA_FOTO }]);
  });

  it("devolve a original quando ela ja e pequena", async () => {
    estado.largura = 1200;
    estado.altura = 900;

    expect(await reduzirFoto("cache/camera.jpg")).toBe("cache/camera.jpg");
    expect(estado.redimensionamentos).toEqual([]);
  });

  it("devolve a original, sem registrar erro, num APK sem o modulo", async () => {
    // OTA chegando a um APK anterior ao modulo: importar derrubaria o app.
    estado.moduloPresente = false;

    expect(await reduzirFoto("cache/camera.jpg")).toBe("cache/camera.jpg");
    expect(capturarErro).not.toHaveBeenCalled();
  });

  it("devolve a original e registra quando a reducao falha", async () => {
    estado.falharAoSalvar = true;

    expect(await reduzirFoto("cache/camera.jpg")).toBe("cache/camera.jpg");
    expect(capturarErro).toHaveBeenCalledOnce();
  });
});
