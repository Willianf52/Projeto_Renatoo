"use client";

import { CLASSES_DO_TOM, type Tom } from "./tons-de-acao";

/**
 * Botao desabilitado em vez de clicavel sem efeito. O motivo entra no rotulo
 * porque "sem destino ainda" e "voce nao tem permissao" sao situacoes
 * diferentes e quem usa a tela precisa distinguir uma da outra.
 *
 * `aria-disabled` no lugar do atributo `disabled`: um `<button disabled>` sai
 * da ordem de tabulacao e nunca recebe foco, entao leitor de tela e
 * navegacao por teclado nunca chegam ao `title`/`aria-label` que explica o
 * motivo. `aria-disabled` com `onClick` no-op preserva o foco e ainda impede
 * a acao.
 *
 * "use client": o `onClick` e uma funcao, e funcao nao serializa pelo limite
 * servidor/cliente. Sem a diretiva, as duas telas que usam este componente
 * (Server Components) quebram com "Event handlers cannot be passed to Client
 * Component props" -- as chamadas anteriores, so com `disabled`, nao
 * precisavam desta fronteira.
 *
 * Vivia duplicado -- literal, comentario incluso -- em
 * `grupo-de-sites/page.tsx` e como dois botoes soltos em
 * `coletas-importadas/page.tsx`.
 */
export function AcaoDesabilitada({
  titulo,
  motivo = "em breve",
  tom,
  className = "",
  children,
}: {
  titulo: string;
  motivo?: string;
  /** O mesmo tipo do botao ativo, esmaecido (`tons-de-acao.ts`). */
  tom?: Tom;
  className?: string;
  children: React.ReactNode;
}) {
  const cores = tom ? `${CLASSES_DO_TOM[tom]} opacity-40` : "text-white/60";
  const rotulo = `${titulo}: ${motivo}`;
  return (
    <button
      type="button"
      aria-disabled="true"
      onClick={(event) => event.preventDefault()}
      title={rotulo}
      aria-label={rotulo}
      className={`flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface ${cores} ${className}`}
    >
      {children}
    </button>
  );
}
