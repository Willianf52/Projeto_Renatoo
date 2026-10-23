// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  pedidos: [] as string[],
  erro: null as { code?: string } | null,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: async (email: string) => {
        estado.pedidos.push(email);
        return { error: estado.erro };
      },
    },
  }),
}));
vi.mock("@/components/HeroPanel", () => ({ HeroPanel: () => null }));

const { default: RecuperarSenhaPage } = await import("./page");
const { INTERVALO_DE_REENVIO_EM_SEGUNDOS: INTERVALO_DE_REENVIO } = await import(
  "@projeto-renatoo/shared/recuperacao-de-senha"
);

beforeEach(() => {
  vi.useFakeTimers();
  estado.pedidos = [];
  estado.erro = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function enviar(email: string) {
  render(<RecuperarSenhaPage />);
  fireEvent.change(screen.getByLabelText("Seu e-mail"), { target: { value: email } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  });
}

async function passar(segundos: number) {
  for (let i = 0; i < segundos; i++) {
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  }
}

// Pedido do dono (23/10/2026): um botao de reenviar, com 60 s de intervalo.
describe("Perdeu sua Senha? > Reenviar e-mail", () => {
  it("depois do envio, o reenvio fica travado com a contagem", async () => {
    await enviar("inspetor@exemplo.com");

    const botao = screen.getByRole("button", { name: `Reenviar em ${INTERVALO_DE_REENVIO} s` });
    expect(botao).toBeDisabled();
    await passar(1);
    expect(screen.getByRole("button", { name: `Reenviar em ${INTERVALO_DE_REENVIO - 1} s` })).toBeDisabled();
  });

  it("aos 60 s libera, reenvia para o mesmo e-mail e recomeca a contagem", async () => {
    await enviar("inspetor@exemplo.com");
    await passar(INTERVALO_DE_REENVIO);

    const botao = screen.getByRole("button", { name: "Reenviar e-mail" });
    expect(botao).toBeEnabled();
    await act(async () => {
      fireEvent.click(botao);
    });

    expect(estado.pedidos).toEqual(["inspetor@exemplo.com", "inspetor@exemplo.com"]);
    expect(screen.getByRole("status")).toHaveTextContent("E-mail reenviado.");
    expect(screen.getByRole("button", { name: `Reenviar em ${INTERVALO_DE_REENVIO} s` })).toBeDisabled();
  });

  it("travado, o toque nao pede nada", async () => {
    await enviar("inspetor@exemplo.com");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Reenviar em/ }));
    });
    expect(estado.pedidos).toEqual(["inspetor@exemplo.com"]);
  });

  it("limite do projeto no reenvio vira aviso, e nao 'reenviado'", async () => {
    await enviar("inspetor@exemplo.com");
    await passar(INTERVALO_DE_REENVIO);
    estado.erro = { code: "over_email_send_rate_limit" };

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reenviar e-mail" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Muitos pedidos de recuperação agora");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
