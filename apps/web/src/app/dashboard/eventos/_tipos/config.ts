/**
 * Tipos de Analise e Tipos de Classificacao (issue #209, migration 0071).
 *
 * Os dois cadastros sao identicos na referencia (Nome, Cor, Status) e nas
 * tabelas da 0064, entao a tela e uma so, parametrizada por este objeto. Pasta
 * com `_` na frente: o App Router nao a transforma em rota.
 */
export type TipoDeCadastro = "analise" | "classificacao";

export const CADASTROS = {
  analise: {
    tabela: "tipos_de_analise",
    rota: "/dashboard/eventos/tipos-de-analise",
    titulo: "Tipos de Análise",
    singular: "Tipo de Análise",
    salvo: "Tipo de análise salvo com sucesso.",
  },
  classificacao: {
    tabela: "tipos_de_classificacao",
    rota: "/dashboard/eventos/tipos-de-classificacao",
    titulo: "Tipos de Classificação",
    singular: "Tipo de Classificação",
    salvo: "Tipo de classificação salvo com sucesso.",
  },
} as const satisfies Record<TipoDeCadastro, unknown>;

/** Cor inicial do formulario: o azul da marca (`brand-blue`, tema.ts). */
export const COR_PADRAO = "#2b6cb0";
