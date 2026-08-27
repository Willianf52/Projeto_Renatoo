import { redirect } from "next/navigation";
import { getPerfilAtual, getUsuarioAtual } from "@/lib/perfil-atual";
import { Skeleton } from "./Skeleton";

/**
 * Nome e cargo de quem esta na sessao, lidos atras de <Suspense> para que a
 * casca do dashboard -- navbar, sidebar e o conteudo da rota -- seja
 * pre-renderizada em vez de esperar a sessao.
 *
 * O `redirect("/")` daqui e a segunda linha de defesa, nao a primeira:
 * `proxy.ts` ja derruba para "/" quem chega sem sessao, revalidando o token
 * com getUser() antes do render. Ele segue valendo, so passa a rodar em tempo
 * de requisicao junto com a leitura, em vez de bloquear o prerender de todas
 * as rotas abaixo de /dashboard.
 *
 * Nome e cargo sao dado de exibicao. Permissao continua vindo das funcoes
 * `security definer` por RPC -- ver o aviso em lib/perfil-atual.ts.
 */
async function identidade() {
  const user = await getUsuarioAtual();

  if (!user) {
    redirect("/");
  }

  // Perfil ausente nao derruba a tela: cai no nome do e-mail e segue. O caso e
  // registrado dentro de getPerfilAtual(), junto com a falha de leitura.
  const perfil = await getPerfilAtual();

  return {
    nome: perfil?.nome_completo?.trim() || user.email || "Usuário",
    cargo: perfil?.cargo ?? "OPERADOR",
  };
}

export async function IdentidadeNavbar() {
  const { nome, cargo } = await identidade();

  return (
    <span className="min-w-0 leading-tight">
      <span
        className="block max-w-[220px] truncate text-sm font-medium text-slate-200"
        title={nome}
      >
        {nome}
      </span>
      <span className="block text-xs text-brand-muted">{cargo}</span>
    </span>
  );
}

export function IdentidadeNavbarSkeleton() {
  return (
    <span className="min-w-0 leading-tight">
      <Skeleton as="span" className="block h-4 w-32" />
      <Skeleton as="span" className="mt-1 block h-3 w-20" />
    </span>
  );
}

export async function SaudacaoSidebar() {
  const { nome } = await identidade();

  return (
    <span className="block truncate font-medium text-slate-200" title={nome}>
      {nome}
    </span>
  );
}

export function SaudacaoSidebarSkeleton() {
  return <Skeleton as="span" className="mt-1 block h-4 w-36" />;
}
