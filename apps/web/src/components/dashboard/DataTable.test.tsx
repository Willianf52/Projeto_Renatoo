// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataTable } from "./DataTable";

afterEach(cleanup);

const COLUNAS = ["Site", "Visitas", "Última visita", "Ações"];
const LINHAS = [
  ["Loja Ipiranga", "12", "29/09/2026", <button key="e">Editar Ipiranga</button>],
  ["Loja Centro", "1.234", "", <button key="e">Editar Centro</button>],
];

/**
 * jsdom nao aplica CSS: tabela (`hidden lg:block`) e cartoes (`lg:hidden`)
 * estao os dois no DOM aqui. O que se testa e a marcacao de cada um; qual
 * aparece em qual largura e do Tailwind, e a varredura de responsividade.
 */
describe("DataTable", () => {
  it("alinha a direita so a coluna de numeros, no cabecalho e nas celulas", () => {
    render(<DataTable columns={COLUNAS} rows={LINHAS} />);
    const tabela = screen.getByRole("table");

    expect(within(tabela).getByRole("columnheader", { name: "Visitas" })).toHaveClass("text-right");
    expect(within(tabela).getByRole("cell", { name: "1.234" })).toHaveClass("text-right");
    expect(within(tabela).getByRole("columnheader", { name: "Última visita" })).not.toHaveClass("text-right");
  });

  it("fixa o cabecalho e a primeira coluna", () => {
    render(<DataTable columns={COLUNAS} rows={LINHAS} />);
    const tabela = screen.getByRole("table");

    for (const cabecalho of within(tabela).getAllByRole("columnheader")) {
      expect(cabecalho).toHaveClass("sticky", "top-0");
    }
    expect(within(tabela).getByRole("cell", { name: "Loja Ipiranga" })).toHaveClass("sticky", "left-0");
    expect(within(tabela).getByRole("cell", { name: "12" })).not.toHaveClass("sticky");
  });

  it("celula vazia vira travessao, na tabela e no cartao", () => {
    render(<DataTable columns={COLUNAS} rows={LINHAS} />);

    expect(within(screen.getByRole("table")).getByRole("cell", { name: "—" })).toBeInTheDocument();
    const cartaoDoCentro = within(screen.getByRole("list")).getAllByRole("listitem")[1];
    expect(within(cartaoDoCentro).getByText("—")).toBeInTheDocument();
  });

  it("cartao: primeira coluna vira titulo, as outras pares, e as acoes vao para o pe", () => {
    render(<DataTable columns={COLUNAS} rows={LINHAS} rotulo="Sites" />);

    const lista = screen.getByRole("list", { name: "Sites" });
    const [ipiranga] = within(lista).getAllByRole("listitem");

    expect(ipiranga.querySelector("p")).toHaveTextContent("Loja Ipiranga");
    const rotulos = Array.from(ipiranga.querySelectorAll("dt")).map((dt) => dt.textContent);
    expect(rotulos).toEqual(["Visitas", "Última visita"]);
    // A acao existe no cartao, mas fora dos pares rotulo/valor.
    const acao = within(ipiranga).getByRole("button", { name: "Editar Ipiranga" });
    expect(acao.closest("dl")).toBeNull();
  });

  it("rodape vira um cartao de total, so com as colunas preenchidas", () => {
    render(<DataTable columns={COLUNAS} rows={LINHAS} rodape={["TOTAL:", "1.246", "", ""]} />);

    const itens = within(screen.getByRole("list")).getAllByRole("listitem");
    const total = itens[itens.length - 1];
    expect(total.querySelector("p")).toHaveTextContent("TOTAL:");
    expect(Array.from(total.querySelectorAll("dt")).map((dt) => dt.textContent)).toEqual(["Visitas"]);
  });

  it("sem resultado: so o estado vazio, sem tabela nem cartoes", () => {
    render(<DataTable columns={COLUNAS} rows={[]} emptyTitle="Nenhum site encontrado" />);

    expect(screen.getByText("Nenhum site encontrado")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("paginacao fica fora da area rolavel", () => {
    render(<DataTable columns={COLUNAS} rows={LINHAS} page={2} totalPages={3} buildPageHref={(p) => `?pagina=${p}`} />);

    const area = screen.getByRole("region");
    const proxima = screen.getByRole("link", { name: "Próxima página" });
    expect(area.contains(proxima)).toBe(false);
    expect(proxima).toHaveAttribute("href", "?pagina=3");
  });
});
