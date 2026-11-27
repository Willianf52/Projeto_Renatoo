import { redirect } from "next/navigation";
import { Suspense } from "react";
import { podeVerUsoDoPortal } from "@/lib/permissoes";

/**
 * Portao do "Uso do Portal" (0118): so quem esta em
 * `manutencao.quem_acompanha_o_uso` (hoje, o dono) passa; os demais, GESTOR
 * incluso, voltam para a Pagina Principal, mesmo digitando o endereco. Mesmo
 * arranjo do `SomenteGestor`. O portao de verdade e o RLS de `eventos_de_uso`.
 */
export function SomenteQuemAcompanhaOUso({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Portao>{children}</Portao>
    </Suspense>
  );
}

async function Portao({ children }: { children: React.ReactNode }) {
  if (!(await podeVerUsoDoPortal())) {
    redirect("/dashboard/principal");
  }
  return children;
}
