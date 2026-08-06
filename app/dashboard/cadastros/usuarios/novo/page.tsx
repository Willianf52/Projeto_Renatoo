import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { UserIcon } from "@/components/dashboard/icons";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { UsuarioForm } from "../UsuarioForm";
import { getSuperiores } from "../queries";

const VALORES_VAZIOS = {
  nomeCompleto: "",
  email: "",
  senha: "",
  login: "",
  funcao: "",
  // Mesmo default do trigger `handle_new_user` (migration 0008): o nivel mais
  // baixo, para que conceder mais seja sempre um ato deliberado.
  cargo: "OPERADOR",
  superiorId: "",
  // Ja marcado: quem chega aqui e um gestor criando alguem de proposito, e o
  // caso comum e que a pessoa deva conseguir entrar. A 0008 defende contra
  // cadastro vindo de fora do app, que e outro caminho.
  ativo: true,
};

export default async function NovoUsuarioPage() {
  // A action confere de novo -- ela e o unico portao de verdade, porque
  // escreve com service_role. Aqui e so para nao mostrar um formulario que
  // sera recusado no envio.
  if (!(await podeAdministrarUsuarios())) {
    redirect("/dashboard/cadastros/usuarios");
  }

  const superiores = await getSuperiores();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Usuários" }, { label: "Novo" }]} />
      </div>

      <div
        className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UserIcon className="h-4 w-4" />
            Novo Usuário
          </h1>
        </div>

        <UsuarioForm valoresIniciais={VALORES_VAZIOS} superiores={superiores} />
      </div>
    </div>
  );
}
