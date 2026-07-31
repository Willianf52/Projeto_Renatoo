import { redirect } from "next/navigation";

/** O dashboard nao tem tela propria: abre direto na listagem de coletas. */
export default function DashboardHome() {
  redirect("/dashboard/inspecoes/coletas-importadas");
}
