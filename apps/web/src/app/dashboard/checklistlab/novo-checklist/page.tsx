import { redirect } from "next/navigation";

/**
 * "Responder Novo Checklist", como no sistema de referencia (13/11/2026, a
 * pedido do dono): la o item do menu abre a tela do Historico de Checklist,
 * e aqui tambem. O endereco proprio continua existindo para o menu e os
 * atalhos da Pagina Principal nao terem dois itens no mesmo endereco (o
 * Historico e de todos; este item, so do GESTOR, ver `layout.tsx`).
 *
 * O formulario de responder pelo portal (0089) saiu junto: no antigo nao ha
 * onde responder checklist pela web, so pelo app.
 */
export default function NovoChecklistPage() {
  redirect("/dashboard/checklistlab/historico-de-checklist");
}
