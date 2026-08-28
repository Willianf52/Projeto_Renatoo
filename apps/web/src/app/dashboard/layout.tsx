import { Suspense } from "react";
import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import {
  IdentidadeNavbar,
  IdentidadeNavbarSkeleton,
  SaudacaoSidebar,
  SaudacaoSidebarSkeleton,
} from "@/components/dashboard/IdentidadeDoUsuario";
import { RodapeDoDashboard } from "@/components/dashboard/RodapeDoDashboard";

/**
 * Sincrono de proposito: qualquer `await` aqui em cima tira do prerender toda
 * rota abaixo de /dashboard -- eram 41 telas presas na leitura de sessao deste
 * layout. A sessao agora e lida dentro dos <Suspense> abaixo.
 */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <DashboardChrome
      identidadeNavbar={
        <Suspense fallback={<IdentidadeNavbarSkeleton />}>
          <IdentidadeNavbar />
        </Suspense>
      }
      saudacaoSidebar={
        <Suspense fallback={<SaudacaoSidebarSkeleton />}>
          <SaudacaoSidebar />
        </Suspense>
      }
      rodape={<RodapeDoDashboard />}
      // TODO: substituir por dados reais quando existir tabela de organizacoes
      organization="UP SERVIÇOS (SUPERVISÃO) - Nova (1876)"
    >
      {children}
    </DashboardChrome>
  );
}
