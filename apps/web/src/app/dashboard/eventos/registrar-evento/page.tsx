import { Suspense } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { MegaphoneIcon } from "@/components/dashboard/icons";
import { podeConfigurarEventos } from "@/lib/permissoes";
import { getOpcoesDoRegistro } from "./queries";
import { RegistrarEventoForm } from "./RegistrarEventoForm";

/** Pagina sem `async`: o corpo faz o `await` dentro do `<Suspense>`. */
export default function RegistrarEventoPage() {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-4xl" campos={6} />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const podeRegistrar = await podeConfigurarEventos();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Registrar Evento" }]} />
      </div>
      <div
        className="max-w-4xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <MegaphoneIcon className="h-4 w-4" />
            Registrar Evento
          </h1>
        </div>
        {podeRegistrar ? (
          <Formulario />
        ) : (
          // A funcao do banco recusaria de qualquer jeito (0072); o aviso so
          // poupa preencher um formulario que nao vai a lugar nenhum.
          <p className="px-4 py-6 text-sm text-brand-muted">
            Registrar evento é só para o nível Gestor. As ocorrências abertas pelo checklist aparecem no Painel de Eventos.
          </p>
        )}
      </div>
    </div>
  );
}

async function Formulario() {
  const opcoes = await getOpcoesDoRegistro();
  return <RegistrarEventoForm sites={opcoes.sites} eventos={opcoes.eventos} classificacoes={opcoes.classificacoes} />;
}
