import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { GridIcon, PinIcon } from "@/components/dashboard/icons";
import { TELAS_DO_MENU } from "@/components/dashboard/telas-do-menu";
import { TAMANHO_DA_GRADE } from "@/lib/atalhos";
import { PersonalizarAtalhos } from "./PersonalizarAtalhos";
import { lerAtalhos } from "./queries";

const TELA_POR_ROTA = new Map(TELAS_DO_MENU.map((tela) => [tela.href, tela]));

/**
 * Pagina Principal -- os "Atalhos da Tela Inicial" do sistema de referencia
 * (pedido do dono, 02/10/2026). A regra da grade mora em `lib/atalhos.ts`; o
 * que fica guardado, na 0062.
 *
 * Nao e a tela de entrada: o login continua abrindo em Coletas Importadas,
 * como no sistema de referencia (decisao do dono no mesmo dia).
 *
 * Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components).
 */
export default function PaginaPrincipal() {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Principal" }]} />
      </div>

      <Suspense fallback={<GradeEsqueleto />}>
        <Atalhos />
      </Suspense>
    </div>
  );
}

async function Atalhos() {
  const { grade, fixados, falhou } = await lerAtalhos();
  const fixadas = new Set(fixados.map((a) => a.rota));

  return (
    <div
      className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
      style={{ animationDelay: "80ms" }}
    >
      <Cabecalho>
        <PersonalizarAtalhos grade={grade} fixados={fixados} />
      </Cabecalho>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 bg-brand-navy/60 px-4 py-2.5 text-xs text-brand-muted">
          <span>
            Fixe os atalhos que você quer manter na posição. Os não fixados são reordenados todo
            mês, conforme o seu uso.
          </span>
          <span className="font-semibold text-white">
            {grade.length} de {TAMANHO_DA_GRADE} atalhos
          </span>
        </div>

        {falhou && (
          <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            Não foi possível carregar a sua personalização. Os atalhos aparecem na ordem padrão.
          </p>
        )}

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grade.map((rota, indice) => {
            const tela = TELA_POR_ROTA.get(rota);
            if (!tela) return null;
            const Icone = tela.icon;
            return (
              <li key={rota} className="animate-fade-in-up" style={{ animationDelay: `${indice * 30}ms` }}>
                <Link
                  href={rota}
                  className="group relative flex h-full items-center gap-4 rounded-lg border border-slate-800 bg-brand-navy px-4 py-5 transition-colors hover:border-brand-green/60"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green transition-colors group-hover:bg-brand-green/20">
                    <Icone className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{tela.label}</span>
                    <span className="mt-0.5 block text-[11px] uppercase tracking-wider text-brand-muted">
                      {tela.secao}
                    </span>
                  </span>
                  {fixadas.has(rota) && (
                    <span title="Atalho fixado" className="absolute right-3 top-3 text-brand-green">
                      <PinIcon className="h-3.5 w-3.5" />
                      <span className="sr-only">Fixado</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Cabecalho({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green">
          <GridIcon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-sm font-semibold text-white">Atalhos da Tela Inicial</h1>
          <p className="text-xs text-brand-muted">Acesso rápido aos recursos que você mais utiliza</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function GradeEsqueleto() {
  return (
    <div className="overflow-hidden rounded-lg bg-brand-surface shadow-sm">
      <Cabecalho />
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: TAMANHO_DA_GRADE }, (_, i) => (
          <div key={i} className="h-[78px] animate-pulse rounded-lg border border-slate-800 bg-brand-navy" />
        ))}
      </div>
    </div>
  );
}
