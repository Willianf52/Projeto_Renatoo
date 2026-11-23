import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  isEnabled: true,
  disponivel: false,
  nova: true,
  falhar: false,
  recarregou: false,
}));

vi.mock("expo-updates", () => ({
  get isEnabled() {
    return estado.isEnabled;
  },
  checkForUpdateAsync: async () => {
    if (estado.falhar) throw new Error("sem rede");
    return { isAvailable: estado.disponivel };
  },
  fetchUpdateAsync: async () => ({ isNew: estado.nova }),
  reloadAsync: async () => {
    estado.recarregou = true;
  },
}));

const { aplicarAtualizacao, buscarAtualizacao } = await import("./atualizacao-do-app");

beforeEach(() => {
  Object.assign(estado, { isEnabled: true, disponivel: false, nova: true, falhar: false, recarregou: false });
});

describe("atualizacao do app ao puxar a tela", () => {
  it("fora do APK (Expo Go) nao procura nada", async () => {
    estado.isEnabled = false;
    expect(await buscarAtualizacao()).toBe("indisponivel");
  });

  it("sem versao nova, nao oferece reiniciar", async () => {
    expect(await buscarAtualizacao()).toBe("sem-novidade");
  });

  it("com versao nova, baixa e avisa", async () => {
    estado.disponivel = true;
    expect(await buscarAtualizacao()).toBe("nova-baixada");
  });

  it("falha de rede nao vira erro na tela", async () => {
    estado.falhar = true;
    expect(await buscarAtualizacao()).toBe("sem-novidade");
  });

  it("aplicar reinicia o app", async () => {
    await aplicarAtualizacao();
    expect(estado.recarregou).toBe(true);
  });
});
