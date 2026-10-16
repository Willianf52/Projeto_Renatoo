/**
 * Tema claro ou escuro do portal (16/10/2026). O claro e o padrao; a escolha
 * de cada pessoa fica no `localStorage` do navegador -- e preferencia de tela,
 * nao dado: nao vai para o banco e nao segue a pessoa em outro aparelho.
 *
 * As cores de cada tema estao em `app/globals.css` ("TEMAS").
 */
export type Tema = "claro" | "escuro";

export const TEMA_PADRAO: Tema = "claro";
export const CHAVE_DO_TEMA = "tema";

export function temaValido(valor: unknown): Tema {
  return valor === "escuro" ? "escuro" : TEMA_PADRAO;
}

/**
 * Roda no <head>, antes do primeiro paint (`app/layout.tsx`). `try`: com o
 * armazenamento bloqueado (aba anonima de alguns navegadores) fica o padrao.
 */
export const SCRIPT_DO_TEMA = `try{var t=localStorage.getItem("${CHAVE_DO_TEMA}");if(t==="escuro"){document.documentElement.setAttribute("data-tema","escuro")}}catch(e){}`;
