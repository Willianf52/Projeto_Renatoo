"use client";

import { useState } from "react";
import { ToastProvider } from "@/components/Toast";
import { DashboardNavbar } from "./DashboardNavbar";
import { DashboardSidebar } from "./DashboardSidebar";

export function DashboardChrome({
  identidadeNavbar,
  saudacaoSidebar,
  rodape,
  organization,
  children,
}: {
  identidadeNavbar: React.ReactNode;
  saudacaoSidebar: React.ReactNode;
  rodape: React.ReactNode;
  organization: string;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Tela grande: o mesmo botao recolhe o menu lateral, como no sistema de
  // referencia (06/11/2026), e a tabela ganha a largura dele. So enquanto o
  // painel esta aberto -- recarregar a pagina traz o menu de volta.
  const [recolhido, setRecolhido] = useState(false);

  const alternarMenu = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) setRecolhido((atual) => !atual);
    else setSidebarOpen((open) => !open);
  };

  return (
    <ToastProvider>
      <div data-densidade="compacta" className="min-h-screen bg-brand-navy print:bg-branco">
        {/* print:hidden direto no <header>, nao num <div> em volta: um wrapper
            sem altura propria fica do tamanho exato do header (h-16) -- e um
            elemento sticky so tem folga pra "grudar" dentro dos limites do
            proprio container. Com o container do tamanho exato do header, essa
            folga e zero: ele se comporta como static desde o primeiro pixel de
            rolagem. A sidebar abaixo nao tem este problema porque o wrapper
            dela e filho de um `flex` e estica para a altura da linha inteira. */}
        <DashboardNavbar
          identidade={identidadeNavbar}
          organization={organization}
          onToggleSidebar={alternarMenu}
          menuRecolhido={recolhido}
        />

        <div className="flex">
          <div className={`print:hidden ${recolhido ? "lg:hidden" : ""}`}>
            <DashboardSidebar
              saudacao={saudacaoSidebar}
              mobileOpen={sidebarOpen}
              onCloseMobile={() => setSidebarOpen(false)}
            />
          </div>

          <main className="flex min-w-0 flex-1 flex-col p-4 sm:p-6 lg:p-8 print:p-0">
            <div className="flex-1">{children}</div>
            {rodape}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
