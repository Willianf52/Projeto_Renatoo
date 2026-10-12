import { afterEach, describe, expect, it, vi } from "vitest";

import { comPrazo, ESGOTADO } from "./com-prazo";

afterEach(() => {
  vi.useRealTimers();
});

describe("comPrazo", () => {
  it("devolve a resposta que chega dentro do prazo", async () => {
    expect(await comPrazo(Promise.resolve(7), 1000)).toBe(7);
  });

  it("devolve ESGOTADO quando a resposta demora, sem cancelar a promessa", async () => {
    vi.useFakeTimers();
    let resolver: (valor: number) => void = () => undefined;
    const lenta = new Promise<number>((r) => {
      resolver = r;
    });

    const corrida = comPrazo(lenta, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await corrida).toBe(ESGOTADO);

    resolver(3);
    expect(await lenta).toBe(3);
  });

  it("repassa a rejeicao que chega dentro do prazo", async () => {
    await expect(comPrazo(Promise.reject(new Error("rede")), 1000)).rejects.toThrow("rede");
  });
});
