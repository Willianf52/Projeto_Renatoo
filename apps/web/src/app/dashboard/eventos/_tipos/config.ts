/**
 * Tipos de Analise e Tipos de Classificacao (issue #209, migration 0071).
 *
 * Os dois cadastros sao identicos na referencia (Nome, Cor, Status) e nas
 * tabelas da 0064, entao a tela e uma so, parametrizada por este objeto. Pasta
 * com `_` na frente: o App Router nao a transforma em rota.
 */
/** Setor, Alerta de Panico e Tipo de Curva (0086) tem o mesmo formato e
 * entram aqui tambem, na secao Cadastros. */
export type TipoDeCadastro = "analise" | "classificacao" | "setor" | "alerta" | "curva";

export const CADASTROS = {
  analise: {
    tabela: "tipos_de_analise",
    rota: "/dashboard/eventos/tipos-de-analise",
    titulo: "Tipos de Análise",
    singular: "Tipo de Análise",
    salvo: "Tipo de análise salvo com sucesso.",
    secao: "Eventos",
  },
  classificacao: {
    tabela: "tipos_de_classificacao",
    rota: "/dashboard/eventos/tipos-de-classificacao",
    titulo: "Tipos de Classificação",
    singular: "Tipo de Classificação",
    salvo: "Tipo de classificação salvo com sucesso.",
    secao: "Eventos",
  },
  setor: {
    tabela: "setores",
    rota: "/dashboard/cadastros/setores",
    titulo: "Setores",
    singular: "Setor",
    salvo: "Setor salvo com sucesso.",
    secao: "Cadastros",
  },
  alerta: {
    tabela: "tipos_alerta_panico",
    rota: "/dashboard/cadastros/tipos-de-alerta-de-panico",
    titulo: "Tipos de Alerta de Pânico",
    singular: "Tipo de Alerta de Pânico",
    salvo: "Tipo de alerta de pânico salvo com sucesso.",
    secao: "Cadastros",
  },
  curva: {
    tabela: "tipos_curva",
    rota: "/dashboard/cadastros/tipos-de-curva",
    titulo: "Tipos de Curva",
    singular: "Tipo de Curva",
    salvo: "Tipo de curva salvo com sucesso.",
    secao: "Cadastros",
  },
} as const satisfies Record<TipoDeCadastro, unknown>;

/** Cor inicial do formulario: o azul da marca (`brand-blue`, tema.ts). */
export const COR_PADRAO = "#2b6cb0";
