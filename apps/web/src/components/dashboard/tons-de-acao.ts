/**
 * Padrao dos botoes quadrados das barras de acao (`Acao`, `AcaoDesabilitada`),
 * de 16/10/2026: so a acao principal ("Novo") e cheia, no verde da Up; as
 * demais sao iguais entre si -- contorno discreto, e so o icone muda de cor
 * pelo tipo. Antes cada tela pintava a sua (amarelo, verde, vermelho, azul
 * translucidos), e no tema claro isso virou um mosaico de tons pastel.
 *
 * As cores de icone usam tons que o tema claro escurece (globals.css,
 * "TEMAS"): o mesmo vermelho que se le sobre o navy se le sobre o branco.
 */
export type Tom = "novo" | "neutro" | "excel" | "pdf" | "importar" | "perigo" | "amarelo" | "azul";

/*
 * "amarelo" e "azul" (06/11/2026) diferenciam botoes do mesmo tipo na mesma
 * barra, com as cores do sistema de referencia: no Historico de Checklist ha
 * dois de Excel e dois de PDF, e eram iguais. "Exportar Respostas para Excel"
 * e amarelo; "Exportar para PDF Unificado" e azul. Sao cheios e de cor fixa
 * (o mesmo nos dois temas), com o icone no contraste da referencia.
 */

const CONTORNO = "border border-slate-700 bg-brand-surface";

export const CLASSES_DO_TOM: Record<Tom, string> = {
  novo: "bg-brand-green text-sobre-verde shadow-sm",
  neutro: `${CONTORNO} text-slate-300`,
  excel: `${CONTORNO} text-emerald-300`,
  pdf: `${CONTORNO} text-red-400`,
  importar: `${CONTORNO} text-sky-200`,
  perigo: "border border-red-500/40 bg-brand-surface text-red-400",
  amarelo: "border border-[#33280c] bg-[#d8b62a] text-[#20262b]",
  azul: "border border-[#3e5a70] bg-[#2a55c4] text-white",
};

/** So no botao ativo: o desabilitado nao reage ao mouse. */
export const HOVER_DO_TOM: Record<Tom, string> = {
  novo: "hover:bg-brand-green-hover hover:shadow-md",
  neutro: "hover:border-slate-600 hover:bg-white/5 hover:text-white",
  excel: "hover:border-emerald-300/60 hover:bg-emerald-500/10",
  pdf: "hover:border-red-400/60 hover:bg-red-500/10",
  importar: "hover:border-sky-200/60 hover:bg-sky-500/10",
  perigo: "hover:border-red-500 hover:bg-red-500/10",
  amarelo: "hover:brightness-110 hover:shadow-md",
  azul: "hover:brightness-110 hover:shadow-md",
};
