"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/HeroPanel";
import { Spinner } from "@/components/Spinner";
import { createClient } from "@/lib/supabase/client";
import { ChevronDownIcon, LogoutIcon, MenuIcon, UserIcon } from "./icons";

export function DashboardNavbar({
  userName,
  cargo,
  organization,
  onToggleSidebar,
}: {
  userName: string;
  cargo: string;
  organization: string;
  onToggleSidebar: () => void;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-800 bg-brand-surface px-4 sm:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Alternar menu"
        className="rounded-md p-2 text-slate-300 hover:bg-slate-800 hover:text-white lg:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {/* A logo leva a tela de abertura do sistema. Aponta direto para as
          coletas em vez de /dashboard: aquela rota so existe para redirecionar
          para ca, e passar por ela custaria um salto a mais. */}
      <Link
        href="/dashboard/inspecoes/coletas-importadas"
        title="Ir para Coletas Importadas"
        className="hidden shrink-0 rounded-lg transition-opacity duration-200 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2 focus:ring-offset-brand-surface sm:block"
      >
        <BrandLogo size="sm" framed />
      </Link>

      <div className="relative flex-1 sm:max-w-sm">
        <select
          defaultValue={organization}
          aria-label="Organização"
          className="h-9 w-full appearance-none rounded-md border border-slate-800 bg-brand-navy px-3 pr-9 text-sm text-white outline-none transition-colors focus:border-brand-green"
        >
          <option value={organization}>{organization}</option>
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-green/20 text-brand-green">
            <UserIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 leading-tight">
            <span
              className="block max-w-[220px] truncate text-sm font-medium text-slate-200"
              title={userName}
            >
              {userName}
            </span>
            <span className="block text-xs text-brand-muted">{cargo}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="group flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition-all duration-200 hover:border-red-500 hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          {signingOut ? (
            <Spinner />
          ) : (
            <LogoutIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          )}
          <span className="hidden sm:inline">{signingOut ? "Saindo..." : "Sair"}</span>
        </button>
      </div>
    </header>
  );
}
