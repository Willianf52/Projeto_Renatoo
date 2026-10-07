// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ cadastrarColetas: vi.fn(async () => ({})) }));

const { BotaoCadastroManual } = await import("./BotaoCadastroManual");
const { FormularioDeCadastroManual, ID_DO_CADASTRO_MANUAL } = await import("./FormularioDeCadastroManual");

const OPCOES = {
  coletoresDados: [],
  funcionarios: [],
  locais: [],
  areas: [],
  eventos: [],
  acoes: [],
  qualificadores: [],
};

afterEach(cleanup);

describe("BotaoCadastroManual", () => {
  it("o formulario nasce fechado, e o + abre e fecha", async () => {
    render(
      <>
        <BotaoCadastroManual />
        <FormularioDeCadastroManual opcoes={OPCOES} />
      </>,
    );
    const bloco = document.getElementById(ID_DO_CADASTRO_MANUAL)!;
    const botao = screen.getByRole("button", { name: "Cadastrar coleta manual" });

    expect(bloco.hidden).toBe(true);
    expect(botao.getAttribute("aria-expanded")).toBe("false");

    await act(async () => fireEvent.click(botao));
    expect(bloco.hidden).toBe(false);
    expect(screen.getByRole("button", { name: "Fechar cadastro manual" }).getAttribute("aria-expanded")).toBe("true");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Fechar cadastro manual" })));
    expect(bloco.hidden).toBe(true);
  });
});
