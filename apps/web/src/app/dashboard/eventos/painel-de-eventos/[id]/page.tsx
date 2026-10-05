import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/dashboard/Skeleton";
import { ChevronLeftIcon, ClipboardListIcon, PdfIcon } from "@/components/dashboard/icons";
import { FUSO_DO_PROJETO } from "@/lib/data-hora";
import { getOcorrencia, idValido, rotuloDoStatus, type OcorrenciaDetalhe } from "../queries";

const PAINEL = "/dashboard/eventos/painel-de-eventos";
const HISTORICO = "/dashboard/checklistlab/historico-de-checklist";

type Props = { params: Promise<{ id: string }> };

/**
 * "Registro de Evento On-Line" -- o detalhe da ocorrencia, como o
 * `vlab_evento_registrado.php` do sistema de referencia: os mesmos campos, na
 * mesma ordem. O que o sistema ainda nao tem fica com o rotulo e vazio
 * (Classificacao, SubTipo, Descricao, E-mails Enviados), como la quando nao
 * ha dado. "Adicionar Analise" e "Finalizar" sao o item 5 do plano da #164.
 *
 * `notFound()` responde igual para "nao existe" e "o RLS nao deixa ver", sem
 * oraculo de ids -- mesma regra do Historico de Checklist.
 */
export default function EventoRegistradoPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <Detalhe params={params} />
    </Suspense>
  );
}

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSO_DO_PROJETO,
});

/** "28/08/2026 - 16:01 hs", como no sistema de referencia. */
function dataHora(iso: string): string {
  return `${DATA_HORA.format(new Date(iso)).replace(", ", " - ")} hs`;
}

async function Detalhe({ params }: Props) {
  const { id } = await params;
  const idNumerico = idValido(id);
  if (idNumerico === null) notFound();

  const ocorrencia = await getOcorrencia(idNumerico);
  if (!ocorrencia) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Painel de Eventos", href: PAINEL }, { label: "Evento Registrado" }]} />
      </div>

      <div className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Registro de Evento On-Line
          </h1>
          <div className="flex items-center gap-2">
            <AcaoDesabilitada titulo="Exportar para PDF" className="bg-red-600/40">
              <PdfIcon className="h-4 w-4" />
            </AcaoDesabilitada>
            <Button href={PAINEL} variant="secondary" className="group">
              <ChevronLeftIcon className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
              Voltar ao painel
            </Button>
          </div>
        </div>

        <Campos ocorrencia={ocorrencia} />
      </div>

      <Secao titulo="E-mails Enviados">
        <p className="px-4 py-4 text-sm text-brand-muted">Nenhum e-mail enviado para este evento.</p>
      </Secao>

      <Secao titulo="Localização">
        <p className="px-4 py-4 text-sm text-brand-muted">
          O app de campo não grava latitude e longitude da visita.
        </p>
      </Secao>

      <Secao titulo={`Arquivos (${ocorrencia.fotos.length})`}>
        {ocorrencia.fotos.length > 0 ? (
          <div className="flex flex-wrap gap-3 p-4">
            {ocorrencia.fotos.map((fotoId) => {
              const href = `${HISTORICO}/${ocorrencia.checklistId}/fotos/${fotoId}`;
              return (
                <a key={fotoId} href={href} target="_blank" rel="noopener" title="Abrir a foto em tamanho real">
                  {/* eslint-disable-next-line @next/next/no-img-element -- mesma rota e mesmo motivo
                      das fotos do Historico de Checklist (ver midia.ts). */}
                  <img
                    src={href}
                    alt={`Foto do checklist ${ocorrencia.checklistId}`}
                    className="h-28 w-28 rounded-md border border-slate-700 object-cover"
                  />
                </a>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-4 text-sm text-brand-muted">Nenhuma foto neste checklist.</p>
        )}
      </Secao>

      <div className="flex flex-wrap justify-end gap-2">
        <AcaoDesabilitada titulo="Adicionar Análise" className="h-10 rounded-md bg-sky-700/40 px-4 text-sm font-semibold">
          ADICIONAR ANÁLISE
        </AcaoDesabilitada>
        <AcaoDesabilitada titulo="Finalizar" className="h-10 rounded-md bg-red-700/40 px-4 text-sm font-semibold">
          FINALIZAR
        </AcaoDesabilitada>
      </div>
    </div>
  );
}

function Campos({ ocorrencia }: { ocorrencia: OcorrenciaDetalhe }) {
  const [primeiraLinha, ...resto] = ocorrencia.descricao;
  const quando = dataHora(ocorrencia.criadoEm);

  const campos: { rotulo: string; valor: React.ReactNode; largo?: boolean }[] = [
    { rotulo: "Número / Ano", valor: ocorrencia.numeroAno },
    { rotulo: "Data / Hora", valor: quando },
    { rotulo: "Status", valor: rotuloDoStatus(ocorrencia.status) },
    { rotulo: "Classificação", valor: "" },
    { rotulo: "Site", valor: ocorrencia.site },
    { rotulo: "Evento", valor: ocorrencia.evento },
    { rotulo: "SubTipo", valor: "" },
    { rotulo: "Descrição", valor: "" },
    { rotulo: "Registrado por", valor: ocorrencia.usuarioAbertura ? `${ocorrencia.usuarioAbertura} em ${quando}` : quando },
    { rotulo: "Integrado em", valor: quando },
    {
      rotulo: "Observação",
      largo: true,
      valor: (
        <>
          <span>
            {primeiraLinha.replace(/\d+$/, "")}
            <Link href={`${HISTORICO}/${ocorrencia.checklistId}`} className="text-brand-green hover:underline">
              {ocorrencia.checklistId}
            </Link>
          </span>
          {resto.map((linha, indice) => (
            <span key={indice} className="block whitespace-pre-line">
              {linha}
            </span>
          ))}
        </>
      ),
    },
  ];

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 md:grid-cols-2">
      {campos.map((campo) => (
        <div key={campo.rotulo} className={`grid grid-cols-[10rem_1fr] gap-3 ${campo.largo ? "md:col-span-2" : ""}`}>
          <dt className="text-sm text-brand-muted">{campo.rotulo}:</dt>
          <dd className="min-w-0 break-words text-sm text-white">{campo.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up">
      <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">{titulo}</h2>
      {children}
    </div>
  );
}
