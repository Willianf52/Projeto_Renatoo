import { Button } from "@/components/Button";
import { BrandLogo } from "@/components/HeroPanel";

/**
 * Par do `app/dashboard/error.tsx`/`loading.tsx`, no nivel de `app/`: cobre
 * qualquer rota fora de `/dashboard` que nao exista, em vez da pagina 404
 * generica do Next. O link volta para o login porque nao ha sessao garantida
 * neste ponto -- `/dashboard` redirecionaria de novo para ca sem usuario
 * autenticado.
 */
export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-brand-navy px-4 text-center">
      <div className="animate-fade-in-up">
        <BrandLogo size="sm" />
      </div>
      <div className="animate-fade-in-up" style={{ animationDelay: "80ms" }}>
        <p className="text-lg font-semibold text-white">Página não encontrada</p>
        <p className="mt-1 text-sm text-brand-muted">
          O endereço acessado não existe ou foi movido.
        </p>
      </div>
      <div className="animate-fade-in-up" style={{ animationDelay: "160ms" }}>
        <Button href="/">Voltar para o início</Button>
      </div>
    </div>
  );
}
