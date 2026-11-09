import { Suspense } from "react";
import { BrandLogo, HeroPanel } from "@/components/HeroPanel";
import { LoginForm } from "@/components/LoginForm";

// Server Component: HeroPanel e a logo sao estaticos e nao precisam ir para o
// bundle do cliente. So o LoginForm (estado, submit, throttle) precisa de JS
// no navegador -- por isso e a unica peca com "use client".
export default function Home() {
  return (
    <div data-tema="escuro" className="flex min-h-screen flex-col bg-brand-navy text-white lg:flex-row">
      {/* Escuro nos dois temas: a entrada e a vitrine da marca (ver globals.css). */}
      <HeroPanel />

      {/* Sidebar de login: superficie levemente elevada sobre o fundo. */}
      <section className="relative flex min-h-screen w-full flex-col bg-[radial-gradient(circle_at_50%_0%,rgba(43,108,176,0.18),transparent_60%)] bg-brand-surface lg:w-[38%] lg:min-w-[380px] lg:max-w-xl">
        <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10">
          {/* O formulario vira um cartao assentado no painel: mais respiro e
              uma saudacao, em vez do formulario solto na lateral. */}
          <div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-800 bg-brand-navy/50 px-7 py-9 shadow-md animate-fade-in-up sm:px-9">
            <div className="mb-8 flex flex-col items-center gap-5 text-center">
              <BrandLogo size="sm" />
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold tracking-tight text-white">Bem-vindo de volta</h2>
                <p className="text-sm text-brand-muted">Acesse o portal com o seu login e a sua senha.</p>
              </div>
            </div>

            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </section>
    </div>
  );
}
