import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { CheckIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { podeVerTodaAOperacao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { FormularioDeAprovacao } from "./FormularioDeAprovacao";

const LISTAGEM = "/dashboard/checklistlab/historico-de-checklist";

export default function AprovacaoPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={2} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const id = idNaUrl((await params).id);
  if (id === null) notFound();
  if (!(await podeVerTodaAOperacao())) redirect(LISTAGEM);

  const supabase = await createClient();
  const { data: checklist } = await supabase
    .from("checklists_visita")
    .select("id, numero, ano, aprovacao, modelos_checklist ( nome )")
    .eq("id", id)
    .maybeSingle();
  if (!checklist) notFound();
  if (checklist.aprovacao !== "AGUARDANDO") redirect(LISTAGEM);
  const numeroAno = `${String(checklist.numero).padStart(5, "0")}/${checklist.ano}`;

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Histórico de Checklist", href: LISTAGEM }, { label: numeroAno }]} />
      </div>
      <div className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up">
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <CheckIcon className="h-4 w-4" />
            Autorização do checklist {numeroAno}
            {checklist.modelos_checklist?.nome ? `: ${checklist.modelos_checklist.nome}` : ""}
          </h1>
        </div>
        <FormularioDeAprovacao id={checklist.id} />
      </div>
    </div>
  );
}
