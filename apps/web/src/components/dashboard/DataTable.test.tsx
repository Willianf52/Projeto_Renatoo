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

  // Achado em 19/10: com muitas colunas a tabela rola de lado, e Editar e
  // Excluir ficavam fora da tela. A coluna "Acoes" fica fixa na direita.
  it("fixa a coluna Acoes na direita, e so ela", () => {
    render(<DataTable columns={COLUNAS} rows={LINHAS} />);
    const tabela = screen.getByRole("table");

    expect(within(tabela).getByRole("columnheader", { name: "Ações" })).toHaveClass("sticky", "right-0");
    expect(within(tabela).getByRole("cell", { name: "Editar Ipiranga" })).toHaveClass("sticky", "right-0");
    expect(within(tabela).getByRole("columnheader", { name: "Visitas" })).not.toHaveClass("right-0");
    expect(within(tabela).getByRole("cell", { name: "12" })).not.toHaveClass("right-0");
  });

  // Pedido do dono (30/09/2026): celula vazia fica vazia -- o travessao que
  // a tabela desenhava era lido como um simbolo a mais, e nao como "nada".
  it("celula vazia fica em branco, na tabela e no cartao", () => {
    render(<DataTable columns={COLUNAS} rows={LINHAS} />);

    const centro = within(screen.getByRole("table")).getByRole("cell", { name: "Loja Centro" }).closest("tr")!;
    expect(within(centro).getAllByRole("cell")[2]).toHaveTextContent(/^$/);
    expect(screen.queryByText("—")).toBeNull();
    const cartaoDoCentro = within(screen.getByRole("list")).getAllByRole("listitem")[1];
    expect(within(cartaoDoCentro).queryByText("—")).toBeNull();
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

  // Achado do dono em 23/10/2026, no celular: Coletas Importadas (11 colunas)
  // ocupava uma tela por coleta, com os rotulos vazios incluidos.
  describe("cartao compacto", () => {
    const COLUNAS_DE_COLETA = ["Coleta", "Data / Hora", "Local", "Funcionário", "Evento", "Observação", "Qualificador", "Ações"];
    const COLETAS = [
      ["100", "21/10/2026, 09:54", "[TESTE] Posto Central", "willian.lucas", "", "Inspeção", "", <button key="e">Excluir 100</button>],
      ["99", "21/10/2026, 09:53", "[TESTE] Posto Central", "", "", "", "", ""],
    ];
    const compacto = { titulo: ["Coleta", "Data / Hora"], principais: ["Local", "Funcionário", "Evento"] };

    it("titulo com Coleta e Data/Hora; pares so dos principais que tem valor", () => {
      render(<DataTable columns={COLUNAS_DE_COLETA} rows={COLETAS} rotulo="Coletas" cartaoCompacto={compacto} />);

      const [primeira, segunda] = within(screen.getByRole("list", { name: "Coletas" })).getAllByRole("listitem");
      expect(primeira.querySelectorAll("p")[0]).toHaveTextContent("100");
      expect(primeira.querySelectorAll("p")[1]).toHaveTextContent("21/10/2026, 09:54");
      // "Evento" e vazio na coleta 100: o rotulo nem aparece.
      expect(Array.from(primeira.querySelectorAll("dl")[0].querySelectorAll("dt")).map((dt) => dt.textContent)).toEqual([
        "Local",
        "Funcionário",
      ]);
      expect(Array.from(segunda.querySelectorAll("dl")[0].querySelectorAll("dt")).map((dt) => dt.textContent)).toEqual([
        "Local",
      ]);
    });

    it("o resto, so o que tem valor, fica em Mais detalhes; sem nada para mostrar, o bloco some", () => {
      render(<DataTable columns={COLUNAS_DE_COLETA} rows={COLETAS} rotulo="Coletas" cartaoCompacto={compacto} />);

      const [primeira, segunda] = within(screen.getByRole("list", { name: "Coletas" })).getAllByRole("listitem");
      const detalhes = primeira.querySelector("details")!;
      expect(detalhes.querySelector("summary")).toHaveTextContent("Mais detalhes");
      expect(Array.from(detalhes.querySelectorAll("dt")).map((dt) => dt.textContent)).toEqual(["Observação"]);
      expect(segunda.querySelector("details")).toBeNull();
    });

    it("as acoes ficam no pe, fora dos pares", () => {
      render(<DataTable columns={COLUNAS_DE_COLETA} rows={COLETAS} rotulo="Coletas" cartaoCompacto={compacto} />);

      const [primeira] = within(screen.getByRole("list", { name: "Coletas" })).getAllByRole("listitem");
      expect(within(primeira).getByRole("button", { name: "Excluir 100" }).closest("dl")).toBeNull();
    });
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
