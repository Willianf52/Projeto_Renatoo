import Link from "next/link";

/**
 * Botao de paginacao (primeira, anterior, proxima, ultima) das listagens.
 *
 * Morava dentro da DataTable, e as grades proprias de Registro de Rondas e
 * Mapa de Locais Inspecionados -- que nao cabem no formato columns/rows dela
 * -- tinham cada uma a sua copia. As copias ficaram para tras quando a
 * DataTable mudou (32px e `scale-90` contra os 36px e 0.97 de agora):
 * exatamente a deriva que o `Button.tsx` documenta. Um componente so, e as
 * tres telas andam juntas.
 *
 * 36px (h-9) e a escala 0.97 do `Button`. Sem `href`, ou desabilitado, vira
 * um `<button disabled>` inerte -- um `<a>` nao tem estado desabilitado.
 */
export function BotaoDePaginacao({
  children,
  disabled,
  href,
  rotulo,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  href?: string;
  /** Nome acessivel: o botao so tem icone. */
  rotulo: string;
}) {
  const className =
    "flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-brand-muted transition-all duration-200 hover:bg-brand-navy hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100";

  if (!href || disabled) {
    return (
      <button type="button" disabled aria-label={rotulo} className={className}>
        {children}
      </button>
    );
  }

  return (
    <Link href={href} aria-label={rotulo} className={className}>
      {children}
    </Link>
  );
}
