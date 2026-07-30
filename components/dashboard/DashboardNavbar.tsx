"use client";

import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/HeroPanel";
import { ChevronDownIcon, LogoutIcon, MenuIcon, UserIcon } from "./icons";

export function DashboardNavbar({
  userName,
  organization,
  onToggleSidebar,
}: {
  userName: string;
  organization: string;
  onToggleSidebar: () => void;
}) {
  const router = useRouter();

  const handleSignOut = () => {
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 bg-brand-navy px-4 shadow-md sm:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Alternar menu"
        className="rounded-md p-2 text-slate-300 hover:bg-slate-800 hover:text-white lg:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <div className="hidden shrink-0 sm:block">
        <BrandLogo variant="light" />
      </div>

      <div className="relative flex-1 sm:max-w-sm">
        <select
          defaultValue={organization}
          aria-label="Organização"
          className="h-9 w-full appearance-none rounded-md border border-slate-700 bg-slate-800 px-3 pr-9 text-sm text-slate-200 outline-none transition-colors focus:border-brand-orange"
        >
          <option value={organization}>{organization}</option>
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-orange/20 text-brand-orange">
            <UserIcon className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium text-slate-200">{userName}</span>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-red-500 hover:text-red-400"
        >
          <LogoutIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
