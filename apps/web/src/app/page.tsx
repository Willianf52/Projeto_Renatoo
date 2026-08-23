import { Suspense } from "react";
import { BrandLogo, HeroPanel } from "@/components/HeroPanel";
import { LoginForm } from "@/components/LoginForm";

// Server Component: HeroPanel e a logo sao estaticos e nao precisam ir para o
// bundle do cliente. So o LoginForm (estado, submit, throttle) precisa de JS
// no navegador -- por isso e a unica peca com "use client".
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <HeroPanel />

      {/* Sidebar de login: superficie levemente elevada sobre o fundo. */}
      <section className="flex min-h-screen w-full flex-col border-l border-slate-800 bg-brand-surface lg:w-[25%] lg:min-w-[320px] lg:max-w-md">
        <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-10 lg:px-8 xl:px-10">
          <div className="mb-10 flex justify-center animate-fade-in-up lg:mb-12">
            <BrandLogo size="sm" />
          </div>

          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
