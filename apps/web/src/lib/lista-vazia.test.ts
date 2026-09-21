import { describe, expect, it } from "vitest";
import { descricaoDeListaVazia, temFiltroAplicado } from "./lista-vazia";

describe("temFiltroAplicado", () => {
  it("primeira abertura, sem parametro nenhum", () => {
    expect(temFiltroAplicado({})).toBe(false);
  });

  it("ignora a pagina", () => {
    expect(temFiltroAplicado({ pagina: "3" })).toBe(false);
  });

  it('ignora campo vazio, que o formulario manda ao clicar em "Filtrar" sem digitar', () => {
    expect(temFiltroAplicado({ busca: "", grupo_site: "   ", tipo_servico: undefined })).toBe(false);
  });

  it("ignora valor igual ao padrao da tela", () => {
    expect(temFiltroAplicado({ busca: "", situacao: "ativos" }, { situacao: "ativos" })).toBe(false);
  });

  it("conta valor diferente do padrao", () => {
    expect(temFiltroAplicado({ situacao: "inativos" }, { situacao: "ativos" })).toBe(true);
  });

  it("conta busca preenchida", () => {
    expect(temFiltroAplicado({ busca: "portaria" })).toBe(true);
  });

  it("le o primeiro valor quando a chave vem repetida", () => {
    expect(temFiltroAplicado({ grupo_site: ["", "7"] })).toBe(false);
    expect(temFiltroAplicado({ grupo_site: ["7"] })).toBe(true);
  });
});

describe("descricaoDeListaVazia", () => {
  const descricaoFiltrada = "Ajuste os filtros acima para localizar cadastros.";

  it("com filtro, mantem a frase da tela", () => {
    expect(descricaoDeListaVazia({ filtrado: true, podeCadastrar: true, descricaoFiltrada })).toBe(
      descricaoFiltrada,
    );
  });

  it("sem filtro, aponta o botao de cadastrar para quem pode", () => {
    expect(descricaoDeListaVazia({ filtrado: false, podeCadastrar: true, descricaoFiltrada })).toContain(
      "botão +",
    );
  });

  it("sem filtro e sem permissao, nao manda procurar botao que esta desabilitado", () => {
    expect(
      descricaoDeListaVazia({ filtrado: false, podeCadastrar: false, descricaoFiltrada }),
    ).not.toContain("botão");
  });
});
