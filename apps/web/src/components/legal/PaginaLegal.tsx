import Link from "next/link";
import { BrandLogo } from "@/components/HeroPanel";

/**
 * Moldura das paginas publicas de texto legal: Termos de Uso, Politica de
 * Cookies e Politica de Privacidade (25/11/2026). As tres sao publicas (sem
 * login, `PUBLIC_ROUTES` no middleware) e se ligam pelo rodape.
 */

export const PAGINAS_LEGAIS = [
  { href: "/termos", rotulo: "Termos de Uso" },
  { href: "/privacidade", rotulo: "Política de Privacidade" },
  { href: "/cookies", rotulo: "Política de Cookies" },
] as const;

export function SecaoLegal({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-white">{titulo}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-brand-muted">{children}</div>
    </section>
  );
}

/** Links entre as paginas legais, menos a atual. Tambem usado no login. */
export function LinksLegais({ atual, className = "" }: { atual?: string; className?: string }) {
  return (
    <nav aria-label="Documentos legais" className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
      {PAGINAS_LEGAIS.filter((p) => p.href !== atual).map((p) => (
        // Sem prefetch: os links aparecem no login, e o prefetch de cada um somava
        // requisicoes ao carregamento da tela mais aberta do portal (orcamento
        // de desempenho, e2e/desempenho.spec.ts). Quase ninguem clica neles.
        <Link
          key={p.href}
          href={p.href}
          prefetch={false}
          className="text-xs text-brand-muted underline underline-offset-2 hover:text-white"
        >
          {p.rotulo}
        </Link>
      ))}
    </nav>
  );
}

export function PaginaLegal({
  titulo,
  atualizadaEm,
  atual,
  children,
}: {
  titulo: string;
  atualizadaEm: string;
  atual: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-brand-navy px-4 py-10 sm:px-6">
      <article className="mx-auto w-full max-w-3xl">
        <BrandLogo size="sm" />

        <h1 className="mt-8 text-2xl font-bold text-white">{titulo}</h1>
        <p className="mt-1 text-xs text-brand-muted">Atualizada em {atualizadaEm}</p>

        {children}

        <div className="mt-10 space-y-3">
          <Link href="/" className="text-sm font-semibold text-brand-green underline underline-offset-2">
            Ir para o portal
          </Link>
          <LinksLegais atual={atual} />
        </div>
      </article>
    </main>
  );
}

/** "Suporte da Up Serviços", com link quando a Vercel tem o endereco. */
export function LinkDoSuporte() {
  const url = process.env.NEXT_PUBLIC_URL_SUPORTE?.trim();
  if (!url || !/^https:\/\/\S+$/.test(url)) return <>suporte da Up Serviços</>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-brand-green underline underline-offset-2"
    >
      suporte da Up Serviços
    </a>
  );
}
