import Link from "next/link";

/**
 * Botao-link quadrado das barras de acao das telas de cadastro/inspecao.
 * Mesma caixa do `AcaoDesabilitada`, com destino real. Vivia duplicado --
 * literal -- como funcao local em `grupo-de-sites/page.tsx`, e precisou de
 * novo em `coletas-importadas/page.tsx` para os links de exportar.
 */
export function Acao({
  titulo,
  href,
  className,
  target,
  children,
}: {
  titulo: string;
  href: string;
  className: string;
  target?: "_blank";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={titulo}
      aria-label={titulo}
      target={target}
      // `noreferrer` junto do `noopener` (achado B-5 da auditoria de 28/08).
      // Hoje todo destino e da propria origem -- rota de exportacao -- entao
      // nenhum dos dois muda nada na pratica; e o valor completo que se
      // escreve uma vez aqui, no unico ponto por onde todo `target="_blank"`
      // do painel passa, para o dia em que um `href` receber valor de fora.
      rel={target === "_blank" ? "noopener noreferrer" : undefined}
      className={`flex h-8 w-8 items-center justify-center rounded-md text-white transition-all duration-200 hover:brightness-125 active:scale-90 ${className}`}
    >
      {children}
    </Link>
  );
}
