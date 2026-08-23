/**
 * Tokens visuais do app. Ficam num arquivo so para as telas nao repetirem
 * hex solto -- e para o dia em que houver tema escuro haver um lugar unico
 * para trocar.
 *
 * Deliberadamente simples: nao e sistema de design, e o minimo para as telas
 * nao divergirem entre si enquanto o app cresce.
 */
export const cores = {
  fundo: "#F5F7FA",
  superficie: "#FFFFFF",
  borda: "#D8DEE7",
  texto: "#101828",
  textoFraco: "#667085",
  textoInverso: "#FFFFFF",
  primaria: "#1D4ED8",
  erroFundo: "#FEF3F2",
  erroTexto: "#B42318",
  avisoFundo: "#FFFAEB",
  avisoTexto: "#B54708",
} as const;

export const espaco = {
  p: 6,
  m: 12,
  g: 20,
  gg: 32,
} as const;
