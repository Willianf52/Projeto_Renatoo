import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AcoesEsqueleto,
  CorpoDeRelatorioEsqueleto,
  FiltrosEmGradeEsqueleto,
  FiltrosEmLinhaEsqueleto,
  FormularioEsqueleto,
  PaginaDeFormularioEsqueleto,
  TabelaEsqueleto,
} from "./EsqueletosDeListagem";

/**
 * A regra dos esqueletos e repetir a FORMA da fronteira que eles substituem
 * (ver o cabecalho do arquivo). Um esqueleto com numero errado de campos ou
 * sem a largura da tela nao da erro nenhum -- da uma tela pulando no instante
 * em que o dado chega. E isso que estes testes travam.
 *
 * `renderToStaticMarkup`, sem jsdom: sao componentes puros de marcacao, e o
 * que importa e o HTML que sai.
 */

const blocosPulsantes = (html: string) => html.match(/animate-pulse/g)?.length ?? 0;

describe("EsqueletosDeListagem", () => {
  it("AcoesEsqueleto desenha um botao por acao da barra", () => {
    expect(blocosPulsantes(renderToStaticMarkup(<AcoesEsqueleto quantidade={4} />))).toBe(4);
  });

  it("FiltrosEmLinhaEsqueleto: rotulo e campo por filtro, mais o botao Filtrar", () => {
    const html = renderToStaticMarkup(<FiltrosEmLinhaEsqueleto campos={3} gradeInterna="grid xl:grid-cols-3" />);

    expect(blocosPulsantes(html)).toBe(3 * 2 + 1);
    expect(html).toContain("grid xl:grid-cols-3");
  });

  it("FiltrosEmGradeEsqueleto: uma celula por campo, com a grade da tela", () => {
    const html = renderToStaticMarkup(<FiltrosEmGradeEsqueleto celulas={5} colunas="xl:grid-cols-5" />);

    expect(blocosPulsantes(html)).toBe(5 * 2);
    expect(html).toContain("xl:grid-cols-5");
  });

  it("CorpoDeRelatorioEsqueleto usa a altura pedida", () => {
    expect(renderToStaticMarkup(<CorpoDeRelatorioEsqueleto altura="h-64" />)).toContain("h-64");
  });

  it("TabelaEsqueleto: linhas x colunas, na largura minima da DataTable", () => {
    const html = renderToStaticMarkup(<TabelaEsqueleto colunas={4} linhas={3} minWidth="min-w-[800px]" />);

    expect(blocosPulsantes(html)).toBe(12);
    expect(html).toContain("min-w-[800px]");
  });

  it("FormularioEsqueleto: rotulo e campo por campo, mais os dois botoes", () => {
    expect(blocosPulsantes(renderToStaticMarkup(<FormularioEsqueleto campos={4} />))).toBe(4 * 2 + 2);
  });

  it("PaginaDeFormularioEsqueleto leva a largura do cartao da tela", () => {
    const html = renderToStaticMarkup(<PaginaDeFormularioEsqueleto largura="max-w-3xl" campos={2} />);

    expect(html).toContain("max-w-3xl");
    // breadcrumb (3) + titulo (1) + formulario (2 campos x 2 + 2 botoes)
    expect(blocosPulsantes(html)).toBe(3 + 1 + 2 * 2 + 2);
  });
});
