// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImprimirAoAbrir } from "./ImprimirAoAbrir";

beforeEach(() => {
  vi.useFakeTimers();
  window.print = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** jsdom nao carrega imagem: `complete` e forcado para simular a pendente. */
function imagemPendente(): HTMLImageElement {
  const imagem = document.createElement("img");
  Object.defineProperty(imagem, "complete", { value: false });
  document.body.appendChild(imagem);
  return imagem;
}

describe("ImprimirAoAbrir", () => {
  it("sem esperar imagens, imprime ao montar", () => {
    render(<ImprimirAoAbrir />);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("espera as imagens carregarem ou falharem antes de imprimir", async () => {
    const primeira = imagemPendente();
    const segunda = imagemPendente();
    render(<ImprimirAoAbrir esperarImagens />);

    primeira.dispatchEvent(new Event("load"));
    await act(async () => {});
    expect(window.print).not.toHaveBeenCalled();

    segunda.dispatchEvent(new Event("error"));
    await act(async () => {});
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("imagem que nao responde nao segura o dialogo para sempre", async () => {
    imagemPendente();
    render(<ImprimirAoAbrir esperarImagens />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
