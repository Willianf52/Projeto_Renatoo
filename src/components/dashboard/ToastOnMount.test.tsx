// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ToastOnMount } from "./ToastOnMount";
import { ToastProvider } from "@/components/Toast";

afterEach(cleanup);

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe("ToastOnMount", () => {
  it("mostra um unico toast mesmo sob o StrictMode do React", () => {
    // O StrictMode (dev) monta, "desmonta" e remonta todo efeito sem
    // cleanup de proposito -- e exatamente o cenario que duplicava o toast
    // antes do guard em ToastOnMount.tsx. Usa o ToastProvider real: o que
    // importa e quantos toasts acabam no DOM, nao quantas vezes uma funcao
    // mockada foi chamada.
    render(
      <StrictMode>
        <ToastProvider>
          <ToastOnMount message="Grupo de usuários salvo com sucesso." cleanHref="/lista" />
        </ToastProvider>
      </StrictMode>,
    );

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/lista");
  });
});
