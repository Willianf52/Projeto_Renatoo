import { Suspense } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { ClipboardListIcon } from "@/components/dashboard/icons";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { createClient } from "@/lib/supabase/server";
import { FormularioDoChecklist } from "./FormularioDoChecklist";

/**
 * "Novo Checklist" no portal, como no sistema de referencia. Os sites vem
 * recortados pelo RLS de quem abre; os modelos de cada site seguem a mesma
 * regra do app (`modelosDoGrupo`: os do grupo, ou o padrao).
 */
export default function NovoChecklistPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-4xl" campos={4} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const supabase = await createClient();
  const [sites, modelos, ligacoes] = await Promise.all([
    buscarEmPaginas<{ id: number; nome: string; grupo_site_id: number }>((de, ate) =>
      supabase
        .from("sites")
        .select("id, nome, grupo_site_id")
        .eq("ativo", true)
        .eq("recebe_visita", true)
        .order("nome")
        .range(de, ate),
    ),
    supabase.from("modelos_checklist").select("id, nome, padrao, ativo"),
    supabase.from("modelos_checklist_grupos").select("modelo_id, grupo_site_id"),
  ]);

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Novo Checklist" }]} />
      </div>
      <div className="max-w-4xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up">
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Novo Checklist
          </h1>
        </div>
        <FormularioDoChecklist
          sites={sites.linhas.map((s) => ({ id: s.id, nome: s.nome, grupoSiteId: s.grupo_site_id }))}
          modelos={modelos.data ?? []}
          ligacoes={ligacoes.data ?? []}
        />
      </div>
    </div>
  );
}
