import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/dashboard/Skeleton";
import { ChevronLeftIcon, ClipboardListIcon, SearchIcon } from "@/components/dashboard/icons";
import { formatarDataHora } from "@/lib/data-hora";
import {
  getChecklist,
  idValido,
  primeiro,
  textoDaConclusao,
  textoDaSituacao,
  TIPO_CONSULTORIA,
  type ChecklistDetalhe,
  type SearchParams,
} from "../queries";

const LISTAGEM = "/dashboard/checklistlab/historico-de-checklist";

/**
 * `async` no corpo da pagina, ao contrario da listagem: aqui o `await` e de
 * `params`, nao de `searchParams`. Uma rota com segmento dinamico ja e
 * renderizada sob demanda, entao nao ha casca estatica a preservar -- mesma
 * forma de `perguntas/[id]/editar/page.tsx`. O unico pedaco que depende de
 * `searchParams` (o link de voltar, que carrega os filtros da listagem) fica
 * na sua propria fronteira de `<Suspense>`, que e o que o Cache Components
 * exige.
 */
export default async function DetalheDoChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const idNumerico = idValido(id);
  if (idNumerico === null) notFound();

  const detalhe = await getChecklist(idNumerico);
  // `null` cobre tanto "nao existe" quanto "existe mas o RLS nao deixa ver":
  // sao a mesma resposta de proposito, senao a tela viraria um oraculo de
  // quais ids existem.
  if (!detalhe) notFound();

  const { linha } = detalhe;

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[
            { label: "ChecklistLab" },
            { label: "Histórico de Checklist", href: LISTAGEM },
            { label: `Checklist ${linha.id}` },
          ]}
        />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Checklist de {linha.checklist} — {linha.numeroAno || `#${linha.id}`}
          </h1>
          <Suspense fallback={<Skeleton className="h-10 w-44" />}>
            <BotaoVoltar searchParams={searchParams} />
          </Suspense>
        </div>

        <Resumo detalhe={detalhe} />
      </div>

      {detalhe.motivoDaCorretiva !== null && (
        <Cartao titulo="Motivo da visita corretiva" atraso="120ms">
          <p className="whitespace-pre-line px-4 py-4 text-sm text-white">{detalhe.motivoDaCorretiva}</p>
        </Cartao>
      )}

      {linha.tipo === TIPO_CONSULTORIA && (
        <Cartao
          titulo={`Respostas (${detalhe.respostas.length} de ${linha.totalPerguntas})`}
          atraso="160ms"
        >
          <TabelaDeRespostas respostas={detalhe.respostas} />
        </Cartao>
      )}

      <Cartao titulo={`Fotos (${detalhe.fotos.length})`} atraso="200ms">
        <Fotos checklistId={linha.id} fotos={detalhe.fotos} />
      </Cartao>

      <Cartao titulo="Assinatura do responsável no local" atraso="240ms">
        {detalhe.temAssinatura ? (
          <div className="p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- a rota
                devolve bytes do bucket privado sob a sessao de quem pede
                (ver midia.ts); next/image faria a otimizacao ir buscar a
                mesma URL de novo, sem cookie, e receber 404. */}
            <img
              src={`${LISTAGEM}/${linha.id}/assinatura`}
              alt={`Assinatura do checklist ${linha.id}`}
              className="max-h-48 rounded-md bg-white p-2"
            />
          </div>
        ) : (
          <Vazio titulo="Sem assinatura" descricao="Este checklist não tem imagem de assinatura no acervo." />
        )}
      </Cartao>
    </div>
  );
}

/** Volta para a listagem preservando os filtros com que a pessoa chegou --
 * sem isto, abrir um checklist e voltar significaria refiltrar tudo. */
async function BotaoVoltar({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    const v = primeiro(valor);
    if (v) query.set(chave, v);
  }
  const texto = query.toString();

  return (
    <Button href={texto ? `${LISTAGEM}?${texto}` : LISTAGEM} variant="secondary" className="group">
      <ChevronLeftIcon className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
      Voltar ao histórico
    </Button>
  );
}

function Resumo({ detalhe }: { detalhe: ChecklistDetalhe }) {
  const { linha } = detalhe;

  const campos: { rotulo: string; valor: string }[] = [
    { rotulo: "ID", valor: String(linha.id) },
    { rotulo: "Número/Ano", valor: linha.numeroAno },
    { rotulo: "Checklist", valor: linha.checklist },
    { rotulo: "Site", valor: linha.site },
    { rotulo: "Responsável", valor: linha.responsavel },
    { rotulo: "Motivo da visita", valor: detalhe.motivoDaVisita },
    { rotulo: "Enviado em", valor: formatarDataHora(linha.enviadoEm) },
    { rotulo: "Visita registrada em", valor: formatarDataHora(detalhe.registradoEm) },
    { rotulo: "Situação", valor: textoDaSituacao(linha) },
    { rotulo: "Conclusão", valor: textoDaConclusao(linha) },
    { rotulo: "Nota", valor: linha.nota === null ? "" : `${linha.nota}%` },
  ];

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {campos.map((campo) => (
        <div key={campo.rotulo} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
            {campo.rotulo}
          </dt>
          {/* Travessao no vazio, mesma convencao da DataTable -- celula em
              branco nao distingue "nao preenchido" de "a tela esqueceu". */}
          <dd className="mt-1 break-words text-sm text-white">{campo.valor || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function TabelaDeRespostas({ respostas }: { respostas: ChecklistDetalhe["respostas"] }) {
  if (respostas.length === 0) {
    return (
      <Vazio
        titulo="Nenhuma resposta registrada"
        descricao="O checklist foi enviado sem nenhuma pergunta respondida."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-xs font-semibold uppercase tracking-wide text-brand-muted">
            <th scope="col" className="w-16 whitespace-nowrap px-4 py-3">
              Ordem
            </th>
            <th scope="col" className="px-4 py-3">
              Pergunta
            </th>
            <th scope="col" className="w-40 whitespace-nowrap px-4 py-3">
              Resposta
            </th>
            <th scope="col" className="px-4 py-3">
              Observação
            </th>
          </tr>
        </thead>
        <tbody>
          {respostas.map((resposta, indice) => (
            <tr
              key={resposta.perguntaId}
              className="border-b border-slate-800/60 animate-fade-in-up"
              style={{ animationDelay: `${Math.min(indice, 12) * 30}ms` }}
            >
              <td className="px-4 py-3 text-brand-muted">{resposta.ordem ?? "—"}</td>
              <td className="px-4 py-3 text-white">{resposta.pergunta || "—"}</td>
              <td className="px-4 py-3">
                <span className={`font-medium ${corDaResposta(resposta.resposta)}`}>
                  {resposta.resposta}
                </span>
              </td>
              <td className="px-4 py-3 text-brand-muted">{resposta.observacao || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** So o "Não" ganha cor de alerta: e a resposta que vira nao conformidade no
 * resumo, e colorir as tres transformaria a coluna num arco-iris sem
 * hierarquia. */
function corDaResposta(resposta: string): string {
  if (resposta === "Não") return "text-red-400";
  if (resposta === "Sim") return "text-brand-green";
  return "text-brand-muted";
}

function Fotos({
  checklistId,
  fotos,
}: {
  checklistId: number;
  fotos: ChecklistDetalhe["fotos"];
}) {
  if (fotos.length === 0) {
    return (
      <Vazio titulo="Sem fotos" descricao="Nenhuma foto foi enviada junto com este checklist." />
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
      {fotos.map((foto) => {
        const href = `${LISTAGEM}/${checklistId}/fotos/${foto.id}`;
        return (
          <li key={foto.id}>
            {/* Link comum e nao <Link>: o destino nao e uma rota de tela, e
                sim bytes de imagem -- prefetch do roteador nao ajuda e
                baixaria a foto inteira so por passar o mouse. */}
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-md border border-slate-800 transition-all duration-200 hover:border-brand-green"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- mesmo
                  motivo da assinatura: a rota exige a sessao de quem pede. */}
              <img
                src={href}
                alt={`Foto do checklist ${checklistId}`}
                className="h-40 w-full bg-brand-navy object-cover"
              />
            </a>
            <p className="mt-1 text-xs text-brand-muted">{formatarDataHora(foto.criadoEm)}</p>
          </li>
        );
      })}
    </ul>
  );
}

function Cartao({
  titulo,
  atraso,
  children,
}: {
  titulo: string;
  atraso: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
      style={{ animationDelay: atraso }}
    >
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <ClipboardListIcon className="h-4 w-4" />
          {titulo}
        </h2>
      </div>
      {children}
    </div>
  );
}

/** Mesmo estado vazio da `DataTable`, em versao de bloco -- reaproveitar o de
 * la exigiria uma tabela em volta, que estes cartoes nao tem. */
function Vazio({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-12 text-center animate-fade-in-up">
      <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
        <SearchIcon className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-white">{titulo}</p>
      <p className="text-sm text-brand-muted">{descricao}</p>
    </div>
  );
}
