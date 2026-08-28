import { cacheLife } from "next/cache";

/**
 * Vive fora do `DashboardChrome` porque `new Date()` num Client Component e
 * lido durante o prerender e derrubava a geracao de toda rota do dashboard
 * (blocking-prerender-current-time-client).
 *
 * `"use cache"` em vez de <Suspense>: o ano nao e dado de requisicao, e
 * adiar isso abriria um buraco na casca estatica -- justo o contrario do que
 * se quer aqui. Cacheado, ele entra no prerender, e `cacheLife("days")`
 * garante que a virada do ano aparece sem depender de um deploy novo.
 */
export async function RodapeDoDashboard() {
  "use cache";
  cacheLife("days");

  return (
    <footer className="mt-8 text-center text-xs text-brand-muted print:hidden">
      © {new Date().getFullYear()} Up Serviços
    </footer>
  );
}
