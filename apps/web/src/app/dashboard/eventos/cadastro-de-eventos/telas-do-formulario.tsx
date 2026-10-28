import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { MegaphoneIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { podeConfigurarEventos } from "@/lib/permissoes";
import type { ValoresDoEvento } from "./actions";
import { EventoForm } from "./EventoForm";
import { getDadosDoFormulario, type EventoDaLista } from "./queries";
import { deMinutos, LISTAGEM } from "./regras";

function valoresDe(evento: EventoDaLista | null): ValoresDoEvento {
  const tempo = deMinutos(evento?.tempoAtendimentoMinutos ?? null);
  const bloqueio = deMinutos(evento?.bloqueioRepeticaoMinutos ?? null);
  return {
    nome: evento?.nome ?? "",
    descricao: evento?.descricao ?? "",
    superiorId: evento?.superiorId ? String(evento.superiorId) : "",
    sites: (evento?.sites ?? []).map((s) => String(s.id)),
    emails: (evento?.emails ?? []).join(", "),
    tempoQuantidade: tempo.quantidade,
    tempoUnidade: tempo.unidade,
    bloqueioQuantidade: bloqueio.quantidade,
    bloqueioUnidade: bloqueio.unidade,
    ativo: evento?.ativo ?? true,
  };
}

/**
 * Corpo de Novo e de Editar, dentro do `<Suspense>` de cada pagina. O RLS
 * recusaria a gravacao de quem nao e GESTOR, mas so depois de preencher tudo.
 */
export async function ConteudoDoFormulario({ params }: { params?: Promise<{ id: string }> }) {
  let id: number | null = null;
  if (params) {
    id = idNaUrl((await params).id);
    if (id === null) notFound();
  }
  if (!(await podeConfigurarEventos())) redirect(LISTAGEM);

  const dados = await getDadosDoFormulario(id);
  if (!dados) notFound();

  const titulo = dados.evento ? `Editar Evento` : "Novo Evento";

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Eventos" }, { label: "Configurações" }, { label: "Cadastro de Eventos" }, { label: dados.evento?.nome ?? "Novo" }]}
        />
      </div>
      <div
        className="max-w-4xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <MegaphoneIcon className="h-4 w-4" />
            {titulo}
          </h1>
        </div>
        <EventoForm
          id={dados.evento?.id}
          valoresIniciais={valoresDe(dados.evento)}
          superiores={dados.superiores}
          temSubtipos={dados.temSubtipos}
          sites={dados.sites}
        />
      </div>
    </div>
  );
}
