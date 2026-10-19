import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { SitemapIcon } from "@/components/dashboard/icons";
import { filtroDeUuid } from "@/lib/id-na-url";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { CARGO_CLIENTE } from "../../criar-conta";
import { NIVEIS_ACESSO } from "../../constantes";
import { getEscopoDoCliente, getGruposSitesParaEscopo, getUsuario } from "../../queries";
import { VincularGruposForm } from "./VincularGruposForm";

const LISTAGEM = "/dashboard/cadastros/usuarios";

/**
 * "Vincular" da lista de Usuarios, como no sistema de referencia, so com
 * grupos de sites (pedido do dono, 19/10/2026). Pagina sem `async`: o `await`
 * da permissao e das consultas fica dentro do Suspense -- ver
 * `[id]/editar/page.tsx`.
 */
export default function VincularUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-3xl" campos={4} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // `profiles.id` e uuid: id malformado seria erro de consulta, nao 404.
  if (filtroDeUuid(id) === undefined) notFound();
  if (!(await podeAdministrarUsuarios())) redirect(LISTAGEM);

  const usuario = await getUsuario(id);
  if (!usuario) notFound();

  const ehCliente = usuario.cargo === CARGO_CLIENTE;
  const [grupos, marcados] = ehCliente ? await Promise.all([getGruposSitesParaEscopo(), getEscopoDoCliente(id)]) : [[], []];

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[
            { label: "Cadastros" },
            { label: "Usuários" },
            { label: usuario.nome_completo || usuario.email },
            { label: "Vincular" },
          ]}
        />
      </div>

      <div
        className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <SitemapIcon className="h-4 w-4" />
            Vínculo de Usuário com Grupo de Sites
          </h1>
        </div>

        {ehCliente ? (
          <VincularGruposForm usuarioId={usuario.id} grupos={grupos} marcados={marcados} />
        ) : (
          <p className="p-4 text-sm text-brand-muted">
            O nível {NIVEIS_ACESSO.find((nivel) => nivel.value === usuario.cargo)?.label ?? usuario.cargo} vê todos os sites, sem restrição por grupo. Só o nível Cliente é limitado
            pelos grupos de sites vinculados.
          </p>
        )}
      </div>
    </div>
  );
}
