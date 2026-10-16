import { redirect } from "next/navigation";
import { Suspense } from "react";
import { podeAdministrarUsuarios } from "@/lib/permissoes";

/**
 * Portao das telas que, no sistema de referencia, so existem no menu do GESTOR
 * (issue #209): quem nao e GESTOR volta para a Pagina Principal, mesmo
 * digitando o endereco. Usado pelo `layout.tsx` de cada pasta, entao cobre a
 * listagem, o novo, o editar e o PDF de uma vez. Rota de API (`route.ts`) nao
 * passa por layout e confere por conta propria.
 *
 * Esconder o item do menu (`somenteGestor` em `telas-do-menu.ts`) e so
 * vitrine; a escrita continua presa pelas policies (0071, 0072, 0073).
 *
 * O `await` fica atras do <Suspense>, como nas paginas (Cache Components): o
 * layout segue sincrono e nao tira a rota do prerender.
 */
export function SomenteGestor({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Portao>{children}</Portao>
    </Suspense>
  );
}

async function Portao({ children }: { children: React.ReactNode }) {
  if (!(await podeAdministrarUsuarios())) {
    redirect("/dashboard/principal");
  }
  return children;
}
