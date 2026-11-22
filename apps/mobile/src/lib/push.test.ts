import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  ambiente: "standalone",
  permissao: "granted",
  pedirResultado: "granted",
  pediuPermissao: false,
  rpc: [] as { nome: string; args: unknown }[],
  apagados: [] as string[],
}));

vi.mock("expo-constants", () => ({
  default: {
    get executionEnvironment() {
      return estado.ambiente;
    },
    expoConfig: { extra: { eas: { projectId: "projeto-teste" } } },
  },
}));

vi.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: () => undefined,
  setNotificationChannelAsync: async () => undefined,
  getPermissionsAsync: async () => ({ status: estado.permissao }),
  requestPermissionsAsync: async () => {
    estado.pediuPermissao = true;
    return { status: estado.pedirResultado };
  },
  getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[abcdefghij0123456789]" }),
}));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

vi.mock("./supabase", () => ({
  supabase: {
    rpc: async (nome: string, args: unknown) => {
      estado.rpc.push({ nome, args });
      return { error: null };
    },
    from: () => ({
      delete: () => ({
        eq: async (_coluna: string, valor: string) => {
          estado.apagados.push(valor);
          return { error: null };
        },
      }),
    }),
  },
}));

const { esquecerAparelhoDoPush, registrarParaPush } = await import("./push");

beforeEach(() => {
  Object.assign(estado, {
    ambiente: "standalone",
    permissao: "granted",
    pedirResultado: "granted",
    pediuPermissao: false,
    rpc: [],
    apagados: [],
  });
});

describe("push no celular", () => {
  it("com permissao, registra o aparelho da pessoa", async () => {
    await registrarParaPush();
    expect(estado.rpc).toEqual([
      {
        nome: "registrar_dispositivo_push",
        args: { p_token: "ExponentPushToken[abcdefghij0123456789]", p_plataforma: "android" },
      },
    ]);
  });

  it("sem permissao, pede uma vez e, se negar, nao registra", async () => {
    estado.permissao = "undetermined";
    estado.pedirResultado = "denied";
    await registrarParaPush();
    expect(estado.pediuPermissao).toBe(true);
    expect(estado.rpc).toEqual([]);
  });

  it("no Expo Go nao tenta registrar", async () => {
    estado.ambiente = "storeClient";
    await registrarParaPush();
    expect(estado.rpc).toEqual([]);
  });

  it("ao sair, apaga o aparelho registrado", async () => {
    await registrarParaPush();
    await esquecerAparelhoDoPush();
    expect(estado.apagados).toEqual(["ExponentPushToken[abcdefghij0123456789]"]);
  });
});
