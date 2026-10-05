// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AbrirPeloHash } from "./AbrirPeloHash";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

beforeEach(() => {
  // jsdom nao implementa rolagem.
  Element.prototype.scrollIntoView = vi.fn();
});

function secoes() {
  return (
    <>
      <AbrirPeloHash ids={["analise", "finalizar"]} />
      <details id="analise">
        <summary>Análise</summary>
      </details>
      <details id="finalizar">
        <summary>Finalizar</summary>
      </details>
      <details id="outra">
        <summary>Outra</summary>
      </details>
    </>
  );
}

const aberta = (id: string) => (document.getElementById(id) as HTMLDetailsElement).open;

describe("AbrirPeloHash", () => {
  it("abre a secao da ancora que a pagina ja traz na URL", () => {
    window.location.hash = "#finalizar";
    render(secoes());

    expect(aberta("finalizar")).toBe(true);
    expect(aberta("analise")).toBe(false);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("sem ancora, nao abre nada", () => {
    render(secoes());
    expect(aberta("analise") || aberta("finalizar")).toBe(false);
  });

  it("trocar a ancora abre a nova e fecha a outra", () => {
    window.location.hash = "#analise";
    render(secoes());
    expect(aberta("analise")).toBe(true);

    act(() => {
      window.location.hash = "#finalizar";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(aberta("finalizar")).toBe(true);
    expect(aberta("analise")).toBe(false);
  });

  it("ancora de outra coisa na pagina e ignorada", () => {
    window.location.hash = "#outra";
    render(secoes());
    expect(aberta("outra")).toBe(false);
  });
});
