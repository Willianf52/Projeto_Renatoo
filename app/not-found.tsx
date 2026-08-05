import Link from "next/link";
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
      <BrandLogo size="sm" />
      <div>
        <p className="text-lg font-semibold text-white">Página não encontrada</p>
        <p className="mt-1 text-sm text-brand-muted">
          O endereço acessado não existe ou foi movido.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-md bg-brand-green px-4 py-2 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-green-hover"
      >
        Voltar para o início
      </Link>
    </div>
  );
}
