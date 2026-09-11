import { beforeEach, describe, expect, it, vi } from "vitest";

import { BLOQUEIO_MS, LIMITE_ZERADO } from "./limite-de-tentativas";

/**
 * A persistencia do limite de tentativas entre aberturas do app.
 *
 * A regra em si ja esta coberta em `limite-de-tentativas.test.ts`; o que falta
 * provar aqui e a camada de fora: que o Keystore indisponivel NAO impede o
 * login, e que estado zerado apaga a chave em vez de gravar lixo.
 *
 * O duble guarda um Map e pode ser mandado a falhar, porque a promessa do
 * modulo ("nenhuma das duas funcoes propaga erro") so se verifica com a
 * plataforma quebrada.
 */
const { armazem, falhas } = vi.hoisted(() => ({
  armazem: new Map<string, string>(),
  falhas: { ler: false, gravar: false, apagar: false },
}));

vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: "afterFirstUnlock",
  getItemAsync: async (chave: string) => {
    if (falhas.ler) throw new Error("Keystore indisponivel");
    return armazem.has(chave) ? armazem.get(chave)! : null;
  },
  setItemAsync: async (chave: string, valor: string) => {
    if (falhas.gravar) throw new Error("Keystore indisponivel");
    armazem.set(chave, valor);
  },
  deleteItemAsync: async (chave: string) => {
    if (falhas.apagar) throw new Error("Keystore indisponivel");
    armazem.delete(chave);
  },
}));

const { lerLimiteGuardado, guardarLimite } = await import("./limite-guardado");

const CHAVE = "login-limite-de-tentativas";
const AGORA = 1_800_000_000_000;

beforeEach(() => {
  armazem.clear();
  falhas.ler = false;
  falhas.gravar = false;
  falhas.apagar = false;
});

describe("leitura", () => {
  it("devolve zerado quando nunca houve nada guardado", async () => {
    expect(await lerLimiteGuardado(AGORA)).toEqual(LIMITE_ZERADO);
  });

  it("devolve o bloqueio que ainda esta valendo", async () => {
    const bloqueadoAte = AGORA + BLOQUEIO_MS;
    armazem.set(CHAVE, JSON.stringify({ tentativas: 0, bloqueadoAte }));

    expect(await lerLimiteGuardado(AGORA)).toEqual({ tentativas: 0, bloqueadoAte });
  });

  it("descarta bloqueio ja vencido", async () => {
    // Fechar o app pelo seletor de tarefas e esperar passar e o contorno
    // legitimo: o bloqueio venceu, entao a leitura nao pode ressuscita-lo.
    armazem.set(CHAVE, JSON.stringify({ tentativas: 0, bloqueadoAte: AGORA - 1 }));

    expect(await lerLimiteGuardado(AGORA)).toEqual(LIMITE_ZERADO);
  });

  it("preserva a contagem parcial entre aberturas", async () => {
    armazem.set(CHAVE, JSON.stringify({ tentativas: 3, bloqueadoAte: null }));

    expect(await lerLimiteGuardado(AGORA)).toEqual({ tentativas: 3, bloqueadoAte: null });
  });

  it("degrada para zerado quando o Keystore esta indisponivel", async () => {
    // Um JSON estragado ou um Keystore fora do ar nao pode ser o motivo de um
    // inspetor nao conseguir entrar em campo.
    falhas.ler = true;

    await expect(lerLimiteGuardado(AGORA)).resolves.toEqual(LIMITE_ZERADO);
  });
});

describe("gravacao", () => {
  it("guarda o bloqueio para sobreviver ao fechamento do app", async () => {
    const bloqueadoAte = AGORA + BLOQUEIO_MS;

    await guardarLimite({ tentativas: 0, bloqueadoAte });

    expect(JSON.parse(armazem.get(CHAVE)!)).toEqual({ tentativas: 0, bloqueadoAte });
  });

  it("guarda a contagem parcial", async () => {
    await guardarLimite({ tentativas: 2, bloqueadoAte: null });

    expect(JSON.parse(armazem.get(CHAVE)!)).toEqual({ tentativas: 2, bloqueadoAte: null });
  });

  it("apaga a chave no estado zerado em vez de gravar", async () => {
    // Gravar zerado deixaria para tras um bloqueio vencido que a proxima
    // leitura teria de descartar -- apagar resolve na origem.
    armazem.set(CHAVE, JSON.stringify({ tentativas: 4, bloqueadoAte: null }));

    await guardarLimite(LIMITE_ZERADO);

    expect(armazem.has(CHAVE)).toBe(false);
  });

  it("nao propaga erro quando o Keystore recusa a gravacao", async () => {
    falhas.gravar = true;

    await expect(guardarLimite({ tentativas: 2, bloqueadoAte: null })).resolves.toBeUndefined();
  });

  it("nao propaga erro quando o Keystore recusa a remocao", async () => {
    falhas.apagar = true;

    await expect(guardarLimite(LIMITE_ZERADO)).resolves.toBeUndefined();
  });
});

describe("ida e volta", () => {
  it("le de volta exatamente o bloqueio que gravou", async () => {
    const estado = { tentativas: 0, bloqueadoAte: AGORA + BLOQUEIO_MS };

    await guardarLimite(estado);

    expect(await lerLimiteGuardado(AGORA)).toEqual(estado);
  });

  it("volta a zerado depois de um acerto que limpa o limite", async () => {
    await guardarLimite({ tentativas: 3, bloqueadoAte: null });
    await guardarLimite(LIMITE_ZERADO);

    expect(await lerLimiteGuardado(AGORA)).toEqual(LIMITE_ZERADO);
  });
});
