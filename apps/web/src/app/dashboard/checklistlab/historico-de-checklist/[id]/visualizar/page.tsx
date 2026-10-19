import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Skeleton } from "@/components/dashboard/Skeleton";
import { CheckIcon, MapPinIcon } from "@/components/dashboard/icons";
import { getChecklist, getSitesDaArvore, idValido, montarArvore, nomeDoChecklist } from "../../queries";
import { ArvoreDeSites } from "./ArvoreDeSites";

const LISTAGEM = "/dashboard/checklistlab/historico-de-checklist";

type Props = { params: Promise<{ id: string }> };

/**
 * O "Visualizar" (olho) do Historico de Checklist, copiado do sistema de
 * referencia em 18/10/2026: o cartao "Site" com a arvore de sites e o do
 * checklist destacado, e o cartao "Visualizar Checklist" com Numero/Ano,
 * Checklist, Descricao, Responsavel e Atividade, tudo so leitura. As
 * respostas, fotos e assinatura ficam no "Visualizar Respostas" (tablet), que
 * e a pagina de detalhe.
 *
 * Descricao e Atividade vem da agenda na referencia; o sistema novo nao tem
 * agenda, entao ficam em branco, como la num checklist avulso.
 */
export default function VisualizarChecklistPage({ params }: Props) {
  return (
    <Suspense fallback={<Esqueleto />}>
      <Visualizar params={params} />
    </Suspense>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-64" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Skeleton className="h-96 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}

async function Visualizar({ params }: Props) {
  const { id } = await params;
  const idNumerico = idValido(id);
  if (idNumerico === null) notFound();

  const [detalhe, sites] = await Promise.all([getChecklist(idNumerico), getSitesDaArvore()]);
  // "Nao existe" e "o RLS nao deixa ver" dao a mesma resposta (ver o detalhe).
  if (!detalhe) notFound();

  const { linha } = detalhe;
  // Aqui a referencia mostra o numero sem os zeros da listagem ("1962/2026").
  const numeroAno = linha.numeroAno.replace(/^0+(?=\d)/, "");

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Histórico de Checklist", href: LISTAGEM }]} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up">
          <h2 className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">
            <MapPinIcon className="h-4 w-4" />
            Site
          </h2>
          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-[6rem_minmax(0,1fr)]">
            <span className="pt-1 text-sm text-white">
              Site <span className="text-red-400">*</span>
            </span>
            <ArvoreDeSites raizes={montarArvore(sites)} selecionado={linha.siteId} />
          </div>
        </section>

        <section
          className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
          style={{ animationDelay: "80ms" }}
        >
          <h1 className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">
            <CheckIcon className="h-4 w-4" />
            Visualizar Checklist
          </h1>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <Campo rotulo="Número/Ano" valor={numeroAno} estreito />
            <Campo rotulo="Checklist" valor={nomeDoChecklist(linha)} />
            <Campo rotulo="Descrição" valor="" alto />
            <Campo rotulo="Responsável" valor={linha.responsavel ? `→${linha.responsavel}` : ""} />
            <Campo rotulo="Atividade" valor="" />
          </dl>
        </section>
      </div>
    </div>
  );
}

/** Campo bloqueado, com a cara de input desabilitado da referencia. */
function Campo({
  rotulo,
  valor,
  estreito = false,
  alto = false,
}: {
  rotulo: string;
  valor: string;
  estreito?: boolean;
  alto?: boolean;
}) {
  return (
    <>
      <dt className="pt-2 text-sm text-white">{rotulo}:</dt>
      <dd
        aria-label={rotulo}
        className={`flex rounded-md border border-slate-800 bg-brand-navy px-3 text-sm text-brand-muted ${
          alto ? "min-h-16 items-start py-2" : "h-10 items-center"
        } ${estreito ? "w-40" : "w-full"}`}
      >
        {valor}
      </dd>
    </>
  );
}
