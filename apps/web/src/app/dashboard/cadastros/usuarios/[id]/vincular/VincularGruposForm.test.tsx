// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ vincularGrupos: vi.fn(async () => ({})) }));

import { VincularGruposForm } from "./VincularGruposForm";

afterEach(cleanup);

const GRUPOS = [
  { value: "3", label: "Lote 1" },
  { value: "5", label: "Lote 2" },
  { value: "8", label: "Supervisão SICOOB" },
];

function marcados(): string[] {
  return (screen.getAllByRole("checkbox", { hidden: true }) as HTMLInputElement[])
    .filter((caixa) => caixa.checked)
    .map((caixa) => caixa.value);
}

describe("VincularGruposForm", () => {
  it("mostra os grupos ja vinculados marcados e a contagem", () => {
    render(<VincularGruposForm usuarioId="u1" grupos={GRUPOS} marcados={["5"]} />);

    expect(marcados()).toEqual(["5"]);
    expect(screen.getByText("1 de 3 selecionados")).toBeTruthy();
  });

  it("a busca esconde as opcoes sem apagar o que ja estava marcado", () => {
    render(<VincularGruposForm usuarioId="u1" grupos={GRUPOS} marcados={["8"]} />);

    fireEvent.change(screen.getByLabelText("Buscar grupo de sites"), { target: { value: "lote" } });

    // A caixa escondida continua no formulario, marcada: vai no envio.
    const sicoob = screen.getByLabelText("Supervisão SICOOB", { selector: "input" }) as HTMLInputElement;
    expect(sicoob.closest("label")?.hidden).toBe(true);
    expect(sicoob.checked).toBe(true);
    expect((screen.getByLabelText("Lote 1") as HTMLInputElement).closest("label")?.hidden).toBe(false);
  });

  it("busca sem diferenciar maiuscula nem acento", () => {
    render(<VincularGruposForm usuarioId="u1" grupos={GRUPOS} marcados={[]} />);

    fireEvent.change(screen.getByLabelText("Buscar grupo de sites"), { target: { value: "SUPERVISAO" } });

    expect((screen.getByLabelText("Lote 1") as HTMLInputElement).closest("label")?.hidden).toBe(true);
    expect((screen.getByLabelText("Supervisão SICOOB") as HTMLInputElement).closest("label")?.hidden).toBe(false);
  });

  it("marcar atualiza a contagem", () => {
    render(<VincularGruposForm usuarioId="u1" grupos={GRUPOS} marcados={[]} />);

    fireEvent.click(screen.getByLabelText("Lote 1"));
    fireEvent.click(screen.getByLabelText("Lote 2"));

    expect(screen.getByText("2 de 3 selecionados")).toBeTruthy();
    expect(marcados()).toEqual(["3", "5"]);
  });
});
