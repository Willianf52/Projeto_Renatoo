"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChartIcon,
  BuildingIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  KeyIcon,
  MegaphoneIcon,
  PieChartIcon,
  PlusCircleIcon,
  PrinterIcon,
  QrCodeIcon,
  SearchIcon,
  SitemapIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "./icons";

type IconComponent = (props: { className?: string }) => React.ReactElement;

type NavLink = {
  label: string;
  href: string;
  icon: IconComponent;
};

/** Sub-secao dentro de um item do menu, como "Relatorios" dentro de
 * "Inspecoes" -- um segundo nivel de agrupamento, com seu proprio toggle. */
type NavGroup = {
  label: string;
  icon: IconComponent;
  items: NavLink[];
};

type NavChild = NavLink | NavGroup;

type NavItem = {
  label: string;
  icon: IconComponent;
  children: NavChild[];
};

const isGroup = (child: NavChild): child is NavGroup => "items" in child;

const NAV_ITEMS: NavItem[] = [
  {
    label: "Cadastros",
    icon: PlusCircleIcon,
    children: [
      { label: "Grupo de Sites", href: "/dashboard/cadastros/grupo-de-sites", icon: SitemapIcon },
      { label: "Site / Planta", href: "/dashboard/cadastros/site-planta", icon: BuildingIcon },
      { label: "Usuários", href: "/dashboard/cadastros/usuarios", icon: UserIcon },
      {
        label: "Grupo de Usuários",
        href: "/dashboard/cadastros/grupo-de-usuarios",
        icon: UsersIcon,
      },
      { label: "QR-Code", href: "/dashboard/cadastros/qr-code", icon: QrCodeIcon },
      { label: "Trocar Senha", href: "/dashboard/cadastros/trocar-senha", icon: KeyIcon },
    ],
  },
  {
    label: "Inspeções",
    icon: SearchIcon,
    children: [
      {
        label: "Coletas Importadas",
        href: "/dashboard/inspecoes/coletas-importadas",
        icon: ClipboardListIcon,
      },
      {
        label: "Relatórios",
        icon: PrinterIcon,
        items: [
          {
            label: "Visitas de Supervisão",
            href: "/dashboard/inspecoes/relatorios/visitas-de-supervisao",
            icon: PieChartIcon,
          },
          {
            label: "Registro das Rondas Por Tempo de Permanência",
            href: "/dashboard/inspecoes/relatorios/registro-de-rondas",
            icon: ClipboardListIcon,
          },
          {
            label: "Ranking de Inspeções",
            href: "/dashboard/inspecoes/relatorios/ranking-de-inspecoes",
            icon: BarChartIcon,
          },
          {
            label: "Mapa de Quantidade de Locais Inspecionados",
            href: "/dashboard/inspecoes/relatorios/mapa-de-locais-inspecionados",
            icon: ClipboardListIcon,
          },
          {
            label: "Quantidade de Horas por Usuário",
            href: "/dashboard/inspecoes/relatorios/horas-por-usuario",
            icon: ClipboardListIcon,
          },
          {
            label: "Inspeções com Início e Fim de Visita",
            href: "/dashboard/inspecoes/relatorios/inspecoes-inicio-fim-visita",
            icon: ClipboardListIcon,
          },
        ],
      },
    ],
  },
  // Modulos ainda sem telas definidas: mantidos visiveis para preservar a
  // estrutura de navegacao do sistema de referencia.
  { label: "Eventos", icon: MegaphoneIcon, children: [] },
  { label: "ChecklistLab", icon: ClipboardListIcon, children: [] },
  { label: "Suporte", icon: UserIcon, children: [] },
];

const childContainsPath = (child: NavChild, pathname: string): boolean =>
  isGroup(child)
    ? child.items.some((item) => pathname.startsWith(item.href))
    : pathname.startsWith(child.href);

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
  // Comeca sempre fechado, como no sistema de referencia -- nao abre sozinho
  // so porque a rota atual mora dentro daquela secao. So abre com o clique.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

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

      {/* lg:top-16 e lg:h-[calc(100vh-4rem)]: hackId do header (h-16, sticky
          top-0 z-20) tambem em cima. Sem o desconto, o aside colado em
          top-0 tenta ocupar o mesmo topo da tela que o header e passa por
          baixo dele -- os 64px finais do menu ficam empurrados pra fora da
          viewport, encobertos pelo header em vez de dentro da area rolavel. */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-brand-navy pt-4 transition-transform lg:sticky lg:top-16 lg:z-0 lg:h-[calc(100vh-4rem)] lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-4 lg:hidden">
          <span className="text-sm font-medium text-slate-300">Menu</span>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={onCloseMobile}
            className="rounded-md p-1 text-brand-muted hover:bg-slate-800 hover:text-white"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <p className="px-5 pb-4 text-sm text-brand-muted">
          Olá,{" "}
          <span className="block truncate font-medium text-slate-200" title={userName}>
            {userName}
          </span>
        </p>

        <nav className="sidebar-scrollbar flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {NAV_ITEMS.map((item, index) => {
            const isExpanded = expanded === item.label;
            const hasChildren = item.children.length > 0;
            const containsActive = item.children.some((child) =>
              childContainsPath(child, pathname),
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
                      ? "bg-brand-green/15 text-brand-green"
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

                {hasChildren && (
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out-soft)] ${
                      isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-3">
                        {item.children.map((child, childIndex) => {
                          if (isGroup(child)) {
                            const groupExpanded = expandedGroup === child.label;
                            const groupActive = child.items.some((groupItem) =>
                              pathname.startsWith(groupItem.href),
                            );
                            const GroupIcon = child.icon;

                            return (
                              <div
                                key={child.label}
                                className="animate-slide-down"
                                style={{ animationDelay: `${childIndex * 50}ms` }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedGroup(groupExpanded ? null : child.label)
                                  }
                                  aria-expanded={groupExpanded}
                                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors duration-200 ${
                                    groupActive || groupExpanded
                                      ? "text-white"
                                      : "text-brand-muted hover:bg-slate-800/60 hover:text-white"
                                  }`}
                                >
                                  <GroupIcon className="h-4 w-4 shrink-0" />
                                  <span className="min-w-0 flex-1">{child.label}</span>
                                  <ChevronDownIcon
                                    className={`h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${
                                      groupExpanded ? "rotate-180" : ""
                                    }`}
                                  />
                                </button>

                                <div
                                  className={`grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out-soft)] ${
                                    groupExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                                  }`}
                                >
                                  <div className="overflow-hidden">
                                    <div className="ml-6 mt-1 space-y-0.5 border-l border-slate-700 pl-3">
                                      {child.items.map((groupItem, groupItemIndex) => {
                                        const isActive = pathname.startsWith(groupItem.href);
                                        const GroupItemIcon = groupItem.icon;

                                        return (
                                          <Link
                                            key={groupItem.href}
                                            href={groupItem.href}
                                            onClick={onCloseMobile}
                                            aria-current={isActive ? "page" : undefined}
                                            className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium leading-snug animate-slide-down transition-colors duration-200 ${
                                              isActive
                                                ? "bg-slate-800 text-white"
                                                : "text-brand-muted hover:bg-slate-800/60 hover:text-white"
                                            }`}
                                            style={{ animationDelay: `${groupItemIndex * 50}ms` }}
                                          >
                                            <GroupItemIcon className="h-3.5 w-3.5 shrink-0" />
                                            <span className="min-w-0 flex-1">
                                              {groupItem.label}
                                            </span>
                                          </Link>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          const isActive = pathname.startsWith(child.href);
                          const ChildIcon = child.icon;

                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={onCloseMobile}
                              aria-current={isActive ? "page" : undefined}
                              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium animate-slide-down transition-colors duration-200 ${
                                isActive
                                  ? "bg-slate-800 text-white"
                                  : "text-brand-muted hover:bg-slate-800/60 hover:text-white"
                              }`}
                              style={{ animationDelay: `${childIndex * 50}ms` }}
                            >
                              <ChildIcon className="h-4 w-4 shrink-0" />
                              <span className="min-w-0 flex-1">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
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
