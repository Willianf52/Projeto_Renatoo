"use client";

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

type NavItem = {
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  children?: string[];
};

const NAV_ITEMS: NavItem[] = [
  { label: "Cadastros", icon: PlusCircleIcon },
  { label: "Inspeções", icon: SearchIcon, children: ["Coletas Importadas"] },
  { label: "Eventos", icon: MegaphoneIcon },
  { label: "ChecklistLab", icon: ClipboardListIcon },
  { label: "Suporte", icon: UserIcon },
];

export function DashboardSidebar({
  userName,
  mobileOpen,
  onCloseMobile,
}: {
  userName: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>("Inspeções");

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
          {NAV_ITEMS.map((item) => {
            const isExpanded = expanded === item.label;
            const Icon = item.icon;

            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : item.label)}
                  aria-expanded={item.children ? isExpanded : undefined}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    isExpanded
                      ? "bg-brand-orange/15 text-brand-orange"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.children && (
                    <ChevronDownIcon
                      className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  )}
                </button>

                {item.children && isExpanded && (
                  <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-3">
                    {item.children.map((child) => (
                      <div
                        key={child}
                        className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white"
                      >
                        {child}
                      </div>
                    ))}
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
