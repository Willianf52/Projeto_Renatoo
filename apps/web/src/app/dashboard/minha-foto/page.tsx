import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { UserIcon } from "@/components/dashboard/icons";
import { linkDaFoto } from "@/lib/foto-do-usuario";
import { getUsuarioAtual } from "@/lib/perfil-atual";
import { EditorDeFoto } from "./EditorDeFoto";

/**
 * "Minha Foto" (0112): a propria pessoa coloca, troca ou remove a foto que
 * aparece no topo do portal. Abre ao clicar no avatar da barra de cima.
 */
export default function MinhaFotoPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-xl" campos={2} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const usuario = await getUsuarioAtual();
  if (!usuario) redirect("/");
  const foto = await linkDaFoto(usuario.id);

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Minha Foto" }]} />
      </div>
      <div className="max-w-xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up" style={{ animationDelay: "80ms" }}>
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UserIcon className="h-4 w-4" />
            Minha Foto
          </h1>
        </div>
        <EditorDeFoto usuarioId={usuario.id} fotoAtual={foto} />
      </div>
    </div>
  );
}
