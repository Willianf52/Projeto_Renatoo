import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { UserIcon } from "@/components/dashboard/icons";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { UsuarioForm } from "../../UsuarioForm";
import {
  getEscopoDoCliente,
  getGruposSitesParaEscopo,
  getSuperiores,
  getUsuario,
} from "../../queries";

const LISTAGEM = "/dashboard/cadastros/usuarios";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!(await podeAdministrarUsuarios())) {
    redirect(LISTAGEM);
  }

  // `profiles.id` e uuid: ao contrario das telas de cadastro, nao ha
  // `Number.isInteger` que sirva de peneira. Um id malformado simplesmente nao
  // acha ninguem, e `maybeSingle` devolve null em vez de estourar.
  const [usuario, superiores, gruposSites, escopo] = await Promise.all([
    getUsuario(id),
    getSuperiores(id),
    getGruposSitesParaEscopo(),
    getEscopoDoCliente(id),
  ]);
  if (!usuario) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[
            { label: "Cadastros" },
            { label: "Usuários" },
            { label: usuario.nome_completo || usuario.email },
          ]}
        />
      </div>

      <div
        className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UserIcon className="h-4 w-4" />
            Editar Usuário
          </h1>
        </div>

        <UsuarioForm
          id={usuario.id}
          superiores={superiores}
          gruposSites={gruposSites}
          valoresIniciais={{
            nomeCompleto: usuario.nome_completo ?? "",
            email: usuario.email,
            // Sempre vazia: a senha atual nao e legivel nem pelo service_role,
            // e em branco quer dizer "manter" na action.
            senha: "",
            login: usuario.login ?? "",
            funcao: usuario.funcao ?? "",
            cargo: usuario.cargo,
            tipo: usuario.tipo,
            superiorId: usuario.superior_id ?? "",
            ativo: usuario.ativo,
            gruposDoCliente: escopo,
          }}
        />
      </div>
    </div>
  );
}
