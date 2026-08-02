"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronDownIcon,
  ClipboardListIcon,
  MegaphoneIcon,
  PlusCircleIcon,
  SearchIcon,
  UserIcon,
  XIcon,
} from "./icons";

type NavChild = {
  label: string;
  href: string;
};

type NavItem = {
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  children: NavChild[];
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Cadastros",
    icon: PlusCircleIcon,
    children: [
      { label: "Trocar Senha", href: "/dashboard/cadastros/trocar-senha" },
    ],
  },
  {
    label: "Inspeções",
    icon: SearchIcon,
    children: [
      { label: "Coletas Importadas", href: "/dashboard/inspecoes/coletas-importadas" },
    ],
  },
  // Modulos ainda sem telas definidas: mantidos visiveis para preservar a
  // estrutura de navegacao do sistema de referencia.
  { label: "Eventos", icon: MegaphoneIcon, children: [] },
  { label: "ChecklistLab", icon: ClipboardListIcon, children: [] },
  { label: "Suporte", icon: UserIcon, children: [] },
];

/** Secao que contem a rota atual, para abrir o menu no lugar certo. */
const findSectionForPath = (pathname: string) =>
  NAV_ITEMS.find((item) => item.children.some((child) => pathname.startsWith(child.href)))
    ?.label ?? null;

export function DashboardSidebar({
  userName,
  mobileOpen,
  onCloseMobile,
}: {
  userName: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<string | null>(() =>
    findSectionForPath(pathname),
  );
  const [syncedPath, setSyncedPath] = useState(pathname);

  // Reabre a secao correta quando a navegacao parte de outro lugar, como um
  // link no conteudo ou o botao voltar do navegador. Ajustar o estado durante
  // a renderizacao -- e nao num efeito -- evita o render em cascata: o React
  // reinicia a renderizacao antes de pintar a tela.
  if (syncedPath !== pathname) {
    setSyncedPath(pathname);
    const section = findSectionForPath(pathname);
    if (section) {
      setExpanded(section);
    }
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-brand-navy/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-brand-navy pt-4 transition-transform lg:static lg:z-0 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-4 lg:hidden">
          <span className="text-sm font-medium text-slate-300">Menu</span>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={onCloseMobile}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <p className="px-5 pb-4 text-sm text-slate-400">
          Olá,{" "}
          <span className="block truncate font-medium text-slate-200" title={userName}>
            {userName}
          </span>
        </p>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {NAV_ITEMS.map((item, index) => {
            const isExpanded = expanded === item.label;
            const hasChildren = item.children.length > 0;
            const containsActive = item.children.some((child) =>
              pathname.startsWith(child.href),
            );
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className="animate-fade-in-left"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : item.label)}
                  aria-expanded={hasChildren ? isExpanded : undefined}
                  disabled={!hasChildren}
                  title={hasChildren ? undefined : "Módulo ainda não disponível"}
                  className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 ${
                    containsActive || isExpanded
                      ? "bg-brand-orange/15 text-brand-orange"
                      : "text-slate-300 hover:translate-x-1 hover:bg-slate-800 hover:text-white"
                  } ${hasChildren ? "" : "cursor-not-allowed opacity-50 hover:translate-x-0 hover:bg-transparent"}`}
                >
                  <Icon className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  <span className="flex-1">{item.label}</span>
                  {hasChildren && (
                    <ChevronDownIcon
                      className={`h-4 w-4 shrink-0 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  )}
                </button>

                {hasChildren && isExpanded && (
                  <div className="ml-8 mt-1 space-y-1 overflow-hidden border-l border-slate-700 pl-3">
                    {item.children.map((child, childIndex) => {
                      const isActive = pathname.startsWith(child.href);

                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onCloseMobile}
                          aria-current={isActive ? "page" : undefined}
                          className={`block rounded-md px-3 py-2 text-sm font-medium animate-slide-down transition-colors duration-200 ${
                            isActive
                              ? "bg-slate-800 text-white"
                              : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                          }`}
                          style={{ animationDelay: `${childIndex * 50}ms` }}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
