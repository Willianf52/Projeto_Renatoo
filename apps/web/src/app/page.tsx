import { Suspense } from "react";
import { BrandLogo, FundoDaEntrada, HeroPanel } from "@/components/HeroPanel";
import { LoginForm } from "@/components/LoginForm";

// Server Component: HeroPanel e a logo sao estaticos e nao precisam ir para o
// bundle do cliente. So o LoginForm (estado, submit, throttle) precisa de JS
// no navegador -- por isso e a unica peca com "use client".
export default function Home() {
  return (
    <div data-tema="escuro" className="relative isolate flex min-h-screen flex-col text-white lg:flex-row">
      {/* Escuro nos dois temas: a entrada e a vitrine da marca (ver globals.css).
          Uma cena so, de borda a borda, com o cartao de login flutuando. */}
      <FundoDaEntrada />
      <HeroPanel />

      <section className="flex min-h-screen w-full items-center justify-center px-6 py-12 lg:w-[460px] lg:shrink-0 lg:pl-0 lg:pr-14 xl:w-[520px] xl:pr-20">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-brand-surface/75 px-7 py-9 shadow-2xl shadow-black/40 backdrop-blur-md animate-fade-in-up sm:px-9">
          <div className="mb-8 space-y-5">
            <BrandLogo size="sm" />
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight text-white">Seja bem-vindo</h2>
              <p className="text-sm text-brand-muted">Entre com o seu login e a sua senha para continuar.</p>
            </div>
          </div>

          <Suspense>
            <LoginForm />
          </Suspense>

          <p className="mt-8 flex items-center justify-center gap-2 border-t border-white/10 pt-5 text-xs text-brand-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-green" />
            Conexão segura · Up Serviços
          </p>
        </div>
      </section>
    </div>
  );
}
