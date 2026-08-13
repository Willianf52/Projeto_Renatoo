// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterTimePicker } from "./FilterTimePicker";

// Sem `globals: true` no vitest.config.mts, o cleanup automatico do Testing
// Library entre testes nao se registra sozinho -- sem isto, o segundo teste
// em diante encontraria elementos do teste anterior ainda no DOM.
afterEach(cleanup);

function hiddenInput(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
}

describe("FilterTimePicker", () => {
  it("mostra o rotulo enquanto nenhum horario foi escolhido", () => {
    render(<FilterTimePicker label="Hora Inicial" name="hora_inicial" />);

    expect(screen.getByRole("button", { name: "Hora Inicial" })).toHaveTextContent("Hora Inicial");
  });

  it("hidden input comeca vazio sem defaultValue", () => {
    const { container } = render(<FilterTimePicker label="Hora Inicial" name="hora_inicial" />);

    expect(hiddenInput(container, "hora_inicial")).toHaveValue("");
  });

  it("com defaultValue, mostra o horario formatado em vez do rotulo", () => {
    const { container } = render(
      <FilterTimePicker label="Hora Inicial" name="hora_inicial" defaultValue="07:30" />,
    );

    expect(screen.getByRole("button", { name: "Hora Inicial" })).toHaveTextContent("07:30");
    expect(hiddenInput(container, "hora_inicial")).toHaveValue("07:30");
  });

  it("abre o popover com os selects de hora e minuto ao clicar no botao", async () => {
    const user = userEvent.setup();
    render(<FilterTimePicker label="Hora Final" name="hora_final" />);

    await user.click(screen.getByRole("button", { name: "Hora Final" }));

    expect(screen.getByRole("dialog", { name: "Horário — Hora Final" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Hora" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Minuto" })).toBeInTheDocument();
  });

  it("escolher hora/minuto e confirmar aplica o valor e fecha o popover", async () => {
    const user = userEvent.setup();
    const { container } = render(<FilterTimePicker label="Hora Inicial" name="hora_inicial" />);

    await user.click(screen.getByRole("button", { name: "Hora Inicial" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Hora" }), "14");
    await user.selectOptions(screen.getByRole("combobox", { name: "Minuto" }), "45");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hora Inicial" })).toHaveTextContent("14:45");
    expect(hiddenInput(container, "hora_inicial")).toHaveValue("14:45");
  });

  it("reabrir o popover parte do horario ja escolhido, nao de meia-noite", async () => {
    const user = userEvent.setup();
    render(<FilterTimePicker label="Hora Inicial" name="hora_inicial" defaultValue="09:15" />);

    await user.click(screen.getByRole("button", { name: "Hora Inicial" }));

    expect(screen.getByRole("combobox", { name: "Hora" })).toHaveValue("09");
    expect(screen.getByRole("combobox", { name: "Minuto" })).toHaveValue("15");
  });

  it("botao de limpar volta ao rotulo e esvazia o hidden input", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FilterTimePicker label="Hora Inicial" name="hora_inicial" defaultValue="07:30" />,
    );

    await user.click(screen.getByRole("button", { name: "Limpar Hora Inicial" }));

    expect(screen.getByRole("button", { name: "Hora Inicial" })).toHaveTextContent("Hora Inicial");
    expect(hiddenInput(container, "hora_inicial")).toHaveValue("");
  });

  it("nao mostra botao de limpar quando nao ha horario escolhido", () => {
    render(<FilterTimePicker label="Hora Inicial" name="hora_inicial" />);

    expect(screen.queryByRole("button", { name: "Limpar Hora Inicial" })).not.toBeInTheDocument();
  });

  it("clicar fora fecha o popover sem aplicar mudanca pendente", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <FilterTimePicker label="Hora Inicial" name="hora_inicial" defaultValue="07:30" />
        <button type="button">Fora</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Hora Inicial" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Hora" }), "23");
    await user.click(screen.getByRole("button", { name: "Fora" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // O valor pendente (23h) nunca foi confirmado com "Aplicar" -- o horario
    // exibido continua sendo o original.
    expect(screen.getByRole("button", { name: "Hora Inicial" })).toHaveTextContent("07:30");
  });
});
