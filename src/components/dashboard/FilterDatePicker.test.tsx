// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterDatePicker } from "./FilterDatePicker";

// Sem `globals: true` no vitest.config.mts, o cleanup automatico do Testing
// Library entre testes nao se registra sozinho -- sem isto, o segundo teste
// em diante encontraria elementos do teste anterior ainda no DOM.
afterEach(cleanup);

function hiddenInput(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
}

/** Dia 20 nunca cai no preenchimento do mes vizinho (no maximo 14 celulas de
 * sobra numa grade de 42, ver construirGrade) -- clicavel sem ambiguidade em
 * qualquer mes. */
function clicarDia20(dialogo: HTMLElement) {
  const botoes = within(dialogo).getAllByRole("button", { name: "20" });
  return botoes[0];
}

describe("FilterDatePicker", () => {
  it("mostra o rotulo enquanto nenhuma data foi escolhida", () => {
    render(<FilterDatePicker label="Data Inicial" name="data_inicial" />);

    expect(screen.getByRole("button", { name: "Data Inicial" })).toHaveTextContent("Data Inicial");
  });

  it("hidden input comeca vazio sem defaultValue", () => {
    const { container } = render(<FilterDatePicker label="Data Inicial" name="data_inicial" />);

    expect(hiddenInput(container, "data_inicial")).toHaveValue("");
  });

  it("com defaultValue, mostra dd/mm/aaaa em vez do rotulo", () => {
    const { container } = render(
      <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue="2026-03-10" />,
    );

    expect(screen.getByRole("button", { name: "Data Inicial" })).toHaveTextContent("10/03/2026");
    expect(hiddenInput(container, "data_inicial")).toHaveValue("2026-03-10");
  });

  it("abre o calendario no mes da data escolhida", async () => {
    const user = userEvent.setup();
    render(<FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue="2026-03-10" />);

    await user.click(screen.getByRole("button", { name: "Data Inicial" }));

    const dialogo = screen.getByRole("dialog", { name: "Calendário — Data Inicial" });
    expect(within(dialogo).getByText("Março 2026")).toBeInTheDocument();
  });

  it("escolher um dia aplica a data, formata o botao e fecha o calendario", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue="2026-03-10" />,
    );

    await user.click(screen.getByRole("button", { name: "Data Inicial" }));
    const dialogo = screen.getByRole("dialog", { name: "Calendário — Data Inicial" });
    await user.click(clicarDia20(dialogo));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Data Inicial" })).toHaveTextContent("20/03/2026");
    expect(hiddenInput(container, "data_inicial")).toHaveValue("2026-03-20");
  });

  it("navegar para o proximo mes troca o cabecalho sem alterar a selecao", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue="2026-03-10" />,
    );

    await user.click(screen.getByRole("button", { name: "Data Inicial" }));
    await user.click(screen.getByRole("button", { name: "Próximo mês" }));

    const dialogo = screen.getByRole("dialog", { name: "Calendário — Data Inicial" });
    expect(within(dialogo).getByText("Abril 2026")).toBeInTheDocument();
    // So navegar nao aplica nada -- a selecao so muda ao clicar um dia.
    expect(hiddenInput(container, "data_inicial")).toHaveValue("2026-03-10");
  });

  it("navegar para o mes anterior troca o cabecalho", async () => {
    const user = userEvent.setup();
    render(<FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue="2026-03-10" />);

    await user.click(screen.getByRole("button", { name: "Data Inicial" }));
    await user.click(screen.getByRole("button", { name: "Mês anterior" }));

    const dialogo = screen.getByRole("dialog", { name: "Calendário — Data Inicial" });
    expect(within(dialogo).getByText("Fevereiro 2026")).toBeInTheDocument();
  });

  it("botao de limpar volta ao rotulo e esvazia o hidden input", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue="2026-03-10" />,
    );

    await user.click(screen.getByRole("button", { name: "Limpar Data Inicial" }));

    expect(screen.getByRole("button", { name: "Data Inicial" })).toHaveTextContent("Data Inicial");
    expect(hiddenInput(container, "data_inicial")).toHaveValue("");
  });

  it("nao mostra botao de limpar quando nao ha data escolhida", () => {
    render(<FilterDatePicker label="Data Inicial" name="data_inicial" />);

    expect(screen.queryByRole("button", { name: "Limpar Data Inicial" })).not.toBeInTheDocument();
  });

  it("clicar fora fecha o calendario sem escolher nada", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue="2026-03-10" />
        <button type="button">Fora</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Data Inicial" }));
    await user.click(screen.getByRole("button", { name: "Fora" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(hiddenInput(container, "data_inicial")).toHaveValue("2026-03-10");
  });
});
