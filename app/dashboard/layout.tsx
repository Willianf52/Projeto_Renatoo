import { redirect } from "next/navigation";
import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome_completo, cargo")
    .eq("id", user.id)
    .single();

  const userName = profile?.nome_completo?.trim() || user.email || "Usuário";

  return (
    <DashboardChrome
      userName={userName}
      cargo={profile?.cargo ?? "Operador"}
      // TODO: substituir por dados reais quando existir tabela de organizacoes
      organization="UP SERVIÇOS (SUPERVISÃO) - Nova (1876)"
    >
      {children}
    </DashboardChrome>
  );
}
