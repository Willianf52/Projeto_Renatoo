import { redirect } from "next/navigation";
import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { getPerfilAtual, getUsuarioAtual } from "@/lib/perfil-atual";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getUsuarioAtual();

  if (!user) {
    redirect("/");
  }

  // Perfil ausente nao derruba a tela: cai no nome do e-mail e segue. O caso e
  // registrado dentro de getPerfilAtual(), junto com a falha de leitura.
  const perfil = await getPerfilAtual();

  const userName = perfil?.nome_completo?.trim() || user.email || "Usuário";

  return (
    <DashboardChrome
      userName={userName}
      cargo={perfil?.cargo ?? "OPERADOR"}
      // TODO: substituir por dados reais quando existir tabela de organizacoes
      organization="UP SERVIÇOS (SUPERVISÃO) - Nova (1876)"
    >
      {children}
    </DashboardChrome>
  );
}
