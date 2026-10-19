import Link from "next/link";
import { CLASSES_DO_TOM, HOVER_DO_TOM, type Tom } from "./tons-de-acao";

/**
 * Botao-link quadrado das barras de acao das telas de cadastro/inspecao.
 * Mesma caixa do `AcaoDesabilitada`, com destino real. Vivia duplicado --
 * literal -- como funcao local em `grupo-de-sites/page.tsx`, e precisou de
 * novo em `coletas-importadas/page.tsx` para os links de exportar.
 */
export function Acao({
  titulo,
  href,
  tom,
  className = "",
  target,
  children,
}: {
  titulo: string;
  href: string;
  /** O padrao das barras de acao (`tons-de-acao.ts`). Sem ele, o botao fica
   * so com o `className` -- o caso dos icones dentro de tabela. */
  tom?: Tom;
  className?: string;
  target?: "_blank";
  children: React.ReactNode;
}) {
  const cores = tom ? `${CLASSES_DO_TOM[tom]} ${HOVER_DO_TOM[tom]}` : "text-white hover:brightness-125";
  return (
    <Link
      href={href}
      title={titulo}
      aria-label={titulo}
      target={target}
      // Sem prefetch em nenhum botao de acao. Aba nova e rota de exportacao:
      // baixaria a pagina de impressao (com a consulta inteira por tras) so
      // por o botao aparecer na tela. Editar por linha: com a coluna Acoes
      // fixa na direita (19/10) os 25 botoes da pagina ficam a vista, e o
      // Next pre-carregava um destino por linha -- site-planta passou de 28
      // para 38 requisicoes e estourou o orcamento de desempenho.
      prefetch={false}
      // `noreferrer` junto do `noopener` (achado B-5 da auditoria de 28/08).
      // Hoje todo destino e da propria origem -- rota de exportacao -- entao
      // nenhum dos dois muda nada na pratica; e o valor completo que se
      // escreve uma vez aqui, no unico ponto por onde todo `target="_blank"`
      // do painel passa, para o dia em que um `href` receber valor de fora.
      rel={target === "_blank" ? "noopener noreferrer" : undefined}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface active:scale-[0.97] ${cores} ${className}`}
    >
      {children}
    </Link>
  );
}
