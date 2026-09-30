// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast, type ToastVariant } from "./Toast";

afterEach(cleanup);

beforeEach(() => {
  vi.useFakeTimers();
  return () => vi.useRealTimers();
});

/** Botao de teste que dispara `show` -- o toast so existe via o hook. */
function Disparador({ mensagem, variante }: { mensagem: string; variante?: ToastVariant }) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show(mensagem, variante)}>
      disparar {mensagem}
    </button>
  );
}

function disparar(mensagem: string) {
  fireEvent.click(screen.getByRole("button", { name: `disparar ${mensagem}` }));
}

describe("ToastProvider", () => {
  it("sucesso some sozinho depois de 4 s", () => {
    render(
      <ToastProvider>
        <Disparador mensagem="Salvo." />
      </ToastProvider>,
    );

    disparar("Salvo.");
    expect(screen.getByRole("status")).toHaveTextContent("Salvo.");

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText("Salvo.")).toBeNull();
  });

  it("erro fica ate ser fechado, e e anunciado como alert", () => {
    render(
      <ToastProvider>
        <Disparador mensagem="Falhou." variante="error" />
      </ToastProvider>,
    );

    disparar("Falhou.");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Falhou.");

    fireEvent.click(screen.getByRole("button", { name: "Fechar aviso" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("mouse em cima pausa a contagem, e ela retoma de onde parou", () => {
    render(
      <ToastProvider>
        <Disparador mensagem="Salvo." />
      </ToastProvider>,
    );

    disparar("Salvo.");
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const toast = screen.getByRole("status");
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Salvo.")).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    // Faltava 1 s quando pausou: nao ganha 4 s cheios de novo.
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByText("Salvo.")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Salvo.")).toBeNull();
  });

  it("foco no botao de fechar tambem pausa", () => {
    render(
      <ToastProvider>
        <Disparador mensagem="Salvo." />
      </ToastProvider>,
    );

    disparar("Salvo.");
    act(() => {
      screen.getByRole("button", { name: "Fechar aviso" }).focus();
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByText("Salvo.")).toBeInTheDocument();
  });

  it("guarda no maximo tres, saindo o mais antigo", () => {
    render(
      <ToastProvider>
        {["Um.", "Dois.", "Tres.", "Quatro."].map((mensagem) => (
          <Disparador key={mensagem} mensagem={mensagem} variante="error" />
        ))}
      </ToastProvider>,
    );

    for (const mensagem of ["Um.", "Dois.", "Tres.", "Quatro."]) disparar(mensagem);

    expect(screen.getAllByRole("alert").map((t) => t.textContent)).toEqual(["Dois.", "Tres.", "Quatro."]);
  });

  it("informacao usa status, como o sucesso", () => {
    render(
      <ToastProvider>
        <Disparador mensagem="Gerando o arquivo." variante="info" />
      </ToastProvider>,
    );

    disparar("Gerando o arquivo.");
    expect(screen.getByRole("status")).toHaveTextContent("Gerando o arquivo.");
  });
});
