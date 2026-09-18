// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// `queries.ts` puxa o cliente Supabase do servidor; aqui so interessa a funcao
// pura que monta a arvore.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));

const { ArvoreDoMapa } = await import("./ArvoreDoMapa");
const { montarArvore } = await import("./queries");

// Sem `globals: true`, o cleanup do Testing Library nao se registra sozinho.
afterEach(cleanup);

const raiz = montarArvore(
  ["2026-09-01", "2026-09-02"],
  [
    { id: 1, nome: "Hummell", grupoNome: null },
    { id: 2, nome: "SICREDI - SUZANO", grupoNome: "SIC" },
  ],
  [{ site_id: 2, dia: "2026-09-01", quantidade: 3 }],
);

function renderizar() {
  return render(<ArvoreDoMapa colunas={["01/09", "02/09"]} raiz={raiz} />);
}

describe("ArvoreDoMapa", () => {
  it("abre fechada: so a linha da organizacao, com o total do dia", () => {
    renderizar();

    expect(screen.getAllByRole("row")).toHaveLength(2); // cabecalho + UP Serviços
    expect(screen.getByRole("rowheader", { name: /UP Serviços/ })).toBeInTheDocument();
    expect(screen.queryByText("Hummell")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expandir UP Serviços" })).toHaveAttribute("aria-expanded", "false");
  });

  it("expande a organizacao e depois o grupo", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Expandir UP Serviços" }));
    expect(screen.getByText("Hummell")).toBeInTheDocument();
    expect(screen.getByText("SIC")).toBeInTheDocument();
    expect(screen.queryByText("SICREDI - SUZANO")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Expandir SIC" }));
    expect(screen.getByText("SICREDI - SUZANO")).toBeInTheDocument();
  });

  it("recolhe de novo ao clicar outra vez", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Expandir UP Serviços" }));
    await usuario.click(screen.getByRole("button", { name: "Recolher UP Serviços" }));
    expect(screen.queryByText("Hummell")).not.toBeInTheDocument();
  });

  it("pinta de vermelho o dia com ocorrencia e de verde o dia sem", () => {
    renderizar();

    const [comEvento, semEvento] = screen
      .getByRole("rowheader", { name: /UP Serviços/ })
      .closest("tr")!
      .querySelectorAll("td span");
    expect(comEvento).toHaveTextContent("3");
    expect(comEvento.className).toContain("bg-red-600");
    expect(semEvento).toHaveTextContent("0");
    expect(semEvento.className).toContain("bg-emerald-600");
  });
});
