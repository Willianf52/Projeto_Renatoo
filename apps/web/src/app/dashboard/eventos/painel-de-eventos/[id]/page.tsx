import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { AvisoDeSalvo } from "@/components/dashboard/AvisoDeSalvo";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/dashboard/Skeleton";
import { ChevronLeftIcon, ClipboardListIcon, PdfIcon } from "@/components/dashboard/icons";
import { FUSO_DO_PROJETO } from "@/lib/data-hora";
import { podeVerTodaAOperacao } from "@/lib/permissoes";
import { AbrirPeloHash } from "../AbrirPeloHash";
import { aceitaAndamento } from "../andamentos";
import { FormularioDeAndamento } from "../FormularioDeAndamento";
import {
  getOcorrencia,
  getOpcoesDoAndamento,
  idValido,
  rotuloDaSituacaoDoEmail,
  rotuloDoMotivoDoEmail,
  rotuloDoStatus,
  type AndamentoDaOcorrencia,
  type EmailDaOcorrencia,
  type OcorrenciaDetalhe,
  type SearchParams,
} from "../queries";

const PAINEL = "/dashboard/eventos/painel-de-eventos";
const HISTORICO = "/dashboard/checklistlab/historico-de-checklist";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

/**
 * "Registro de Evento On-Line" -- o detalhe da ocorrencia, como o
 * `vlab_evento_registrado.php` do sistema de referencia: os mesmos campos, na
 * mesma ordem. O que o sistema ainda nao tem fica com o rotulo e vazio
 * (Classificacao, SubTipo, Descricao), como la quando nao
 * ha dado. "Adicionar Analise" e "Finalizar" (0064) abrem os formularios
 * abaixo para quem ve toda a operacao; para os demais, ficam desabilitados.
 *
 * `notFound()` responde igual para "nao existe" e "o RLS nao deixa ver", sem
 * oraculo de ids -- mesma regra do Historico de Checklist.
 */
export default function EventoRegistradoPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <Detalhe params={params} searchParams={searchParams} />
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

async function Detalhe({ params, searchParams }: Props) {
  const { id } = await params;
  const idNumerico = idValido(id);
  if (idNumerico === null) notFound();

  const ocorrencia = await getOcorrencia(idNumerico);
  if (!ocorrencia) notFound();

  // Quem pode e o banco que decide; aqui so se escolhe entre o formulario e o
  // botao desabilitado. Os cadastros do formulario so sao lidos se for preciso.
  const aberta = aceitaAndamento(ocorrencia.status);
  const podeAgir = await podeVerTodaAOperacao();
  const opcoes = podeAgir && aberta ? await getOpcoesDoAndamento() : null;

  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <AvisoDeSalvo searchParams={searchParams} listagem={`${PAINEL}/${ocorrencia.id}`} mensagem="Registro salvo com sucesso." />
      </Suspense>

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
        <EmailsEnviados emails={ocorrencia.emails} />
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

      <Secao titulo={`Análises e finalização (${ocorrencia.andamentos.length})`}>
        {ocorrencia.andamentos.length > 0 ? (
          <ol className="divide-y divide-slate-800">
            {ocorrencia.andamentos.map((andamento) => (
              <CartaoDoAndamento key={andamento.id} andamento={andamento} />
            ))}
          </ol>
        ) : (
          <p className="px-4 py-4 text-sm text-brand-muted">Nenhuma análise registrada para este evento.</p>
        )}
      </Secao>

      {opcoes ? (
        <>
          <AbrirPeloHash ids={ANCORAS} />
          <div className="flex flex-wrap justify-end gap-2">
            <a href="#analise" className={`${BOTAO} bg-brand-green text-brand-navy hover:bg-brand-green-hover`}>
              ADICIONAR ANÁLISE
            </a>
            <a href="#finalizar" className={`${BOTAO} bg-red-600 text-white hover:bg-red-500`}>
              FINALIZAR
            </a>
          </div>
          <FormularioRecolhido id="analise" titulo="Adicionar Análise">
            <FormularioDeAndamento ocorrenciaId={ocorrencia.id} tipo="ANALISE" opcoes={opcoes} />
          </FormularioRecolhido>
          <FormularioRecolhido id="finalizar" titulo="Finalizar o Atendimento deste Evento">
            <FormularioDeAndamento ocorrenciaId={ocorrencia.id} tipo="FINALIZACAO" opcoes={opcoes} />
          </FormularioRecolhido>
        </>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <AcaoDesabilitada
            titulo="Adicionar Análise"
            motivo={aberta ? "sem permissão" : "ocorrência encerrada"}
            className={`${BOTAO} bg-slate-700/60 text-slate-300`}
          >
            ADICIONAR ANÁLISE
          </AcaoDesabilitada>
          <AcaoDesabilitada
            titulo="Finalizar"
            motivo={aberta ? "sem permissão" : "ocorrência encerrada"}
            className={`${BOTAO} bg-slate-700/60 text-slate-300`}
          >
            FINALIZAR
          </AcaoDesabilitada>
        </div>
      )}
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

const ANCORAS = ["analise", "finalizar"];
const BOTAO =
  "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors";

/** Recolhido, como a secao do sistema de referencia; a ancora da URL abre. */
function FormularioRecolhido({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <details id={id} className="group scroll-mt-20 overflow-hidden rounded-lg bg-brand-surface shadow-sm">
      <summary className="cursor-pointer list-none border-b border-transparent px-4 py-3 text-sm font-semibold text-white group-open:border-slate-800 [&::-webkit-details-marker]:hidden">
        {titulo}
      </summary>
      {children}
    </details>
  );
}

function CartaoDoAndamento({ andamento }: { andamento: AndamentoDaOcorrencia }) {
  const finalizacao = andamento.tipo === "FINALIZACAO";
  const campos: { rotulo: string; valor: string }[] = [
    { rotulo: "Tipo de Análise", valor: andamento.tipoDeAnalise },
    ...(finalizacao ? [] : [{ rotulo: "Classificação", valor: andamento.classificacao }]),
    ...(finalizacao ? [] : [{ rotulo: "Responsável", valor: andamento.responsavel }]),
    ...(finalizacao ? [] : [{ rotulo: "Grupo de Usuários", valor: andamento.grupo }]),
    ...(finalizacao ? [] : [{ rotulo: "Apoio", valor: andamento.apoio.join(", ") }]),
    ...(finalizacao ? [{ rotulo: "Avisar", valor: andamento.avisar.join(", ") }] : []),
    { rotulo: "E-mails externos", valor: andamento.emailsExternos.join(", ") },
  ].filter((campo) => campo.valor);

  return (
    <li className="space-y-3 px-4 py-4">
      <p className="text-sm font-semibold text-white">
        {finalizacao ? "Finalização" : "Análise"}
        <span className="ml-2 font-normal text-brand-muted">
          {dataHora(andamento.criadoEm)}
          {andamento.autor ? ` · ${andamento.autor}` : ""}
        </span>
      </p>
      <p className="whitespace-pre-line break-words text-sm text-white">
        <span className="text-brand-muted">{finalizacao ? "Ações realizadas: " : "Análise do evento: "}</span>
        {andamento.texto}
      </p>
      {campos.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm md:grid-cols-2">
          {campos.map((campo) => (
            <div key={campo.rotulo} className="grid grid-cols-[9rem_1fr] gap-2">
              <dt className="text-brand-muted">{campo.rotulo}:</dt>
              <dd className="min-w-0 break-words text-white">{campo.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {andamento.anexos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {andamento.anexos.map((anexo) => (
            <li key={anexo.id}>
              <a
                href={`${PAINEL}/anexos/${anexo.id}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-white transition-colors hover:border-brand-green hover:text-brand-green"
              >
                {anexo.nome}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Destinatario, momento, data/hora e situacao, como "E-mails Enviados" da
 * referencia -- mais a situacao, porque aqui o envio e uma fila (0065). */
function EmailsEnviados({ emails }: { emails: EmailDaOcorrencia[] }) {
  if (emails.length === 0) {
    return <p className="px-4 py-4 text-sm text-brand-muted">Nenhum e-mail enviado para este evento.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-800 text-xs uppercase text-brand-muted">
          <tr>
            <th className="px-4 py-2">Destinatário</th>
            <th className="px-4 py-2">Momento</th>
            <th className="px-4 py-2">Data / Hora</th>
            <th className="px-4 py-2">Situação</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((e) => (
            <tr key={e.id} className="border-b border-slate-800/60">
              <td className="px-4 py-2 text-white">{e.destinatario}</td>
              <td className="px-4 py-2">{rotuloDoMotivoDoEmail(e.motivo)}</td>
              <td className="px-4 py-2 tabular-nums">{dataHora(e.enviadoEm ?? e.criadoEm)}</td>
              <td className="px-4 py-2">{rotuloDaSituacaoDoEmail(e.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
