import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/dashboard/Skeleton";
import { ChevronLeftIcon, ClipboardListIcon, SearchIcon } from "@/components/dashboard/icons";
import { formatarDataHora } from "@/lib/data-hora";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { BotaoExcluirChecklist } from "../BotaoExcluirChecklist";
import {
  camposDoResumo,
  getChecklist,
  idValido,
  primeiro,
  TIPO_CONSULTORIA,
  type ChecklistDetalhe,
  type SearchParams,
} from "../queries";

const LISTAGEM = "/dashboard/checklistlab/historico-de-checklist";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
};

/**
 * Pagina sem `async`. Antes ela dava `await` de `params` e do checklist no
 * corpo, supondo que segmento dinamico nao tem casca a preservar -- mas o
 * `next dev` acusava "uncached data": a navegacao ficava parada na listagem
 * ate a consulta voltar. Agora o esqueleto da tela sai na hora e o detalhe
 * entra pelo `<Suspense>`. O link de voltar, que depende de `searchParams`,
 * continua na sua propria fronteira.
 *
 * `notFound()` dentro da fronteira responde igual para "nao existe" e "o RLS
 * nao deixa ver" -- a mesma resposta de antes, sem oraculo de ids.
 */
export default function DetalheDoChecklistPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<DetalheEsqueleto />}>
      <Detalhe params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function DetalheEsqueleto() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-3" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="overflow-hidden rounded-lg bg-brand-surface shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-10 w-44" />
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 11 }).map((_, indice) => (
            <div key={indice} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

async function Detalhe({ params, searchParams }: Props) {
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
            Checklist de {linha.checklist} ({linha.numeroAno || `#${linha.id}`})
          </h1>
          <Suspense fallback={<Skeleton className="h-10 w-44" />}>
            <AcoesDoDetalhe checklistId={linha.id} searchParams={searchParams} />
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
          <TabelaDeRespostas checklistId={linha.id} respostas={detalhe.respostas} />
        </Cartao>
      )}

      {/* Na consultoria, "gerais": as fotos de cada pergunta (0061) ja
          aparecem na linha dela, na tabela acima. */}
      <Cartao
        titulo={`${linha.tipo === TIPO_CONSULTORIA ? "Fotos gerais" : "Fotos"} (${detalhe.fotos.length})`}
        atraso="200ms"
      >
        <Fotos
          checklistId={linha.id}
          fotos={detalhe.fotos}
          vazio={
            linha.tipo === TIPO_CONSULTORIA && detalhe.respostas.some((resposta) => resposta.fotos.length > 0)
              ? "As fotos deste checklist foram tiradas nas perguntas, e estão na tabela de respostas."
              : "Nenhuma foto foi enviada junto com este checklist."
          }
        />
      </Cartao>

      <Cartao titulo="Assinatura do responsável no local" atraso="240ms">
        {detalhe.temAssinatura ? (
          <div className="p-4">
            {/* O app grava o traco em BRANCO (`cores.texto`, sobre o navy do
                quadro) num PNG de fundo transparente. Sobre `bg-white` a
                assinatura ficava invisivel; sobre o mesmo navy do app ela
                aparece como foi colhida. Na impressao o navegador descarta o
                fundo, entao `print:invert` vira o traco para preto no papel. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- a rota
                devolve bytes do bucket privado sob a sessao de quem pede
                (ver midia.ts); next/image faria a otimizacao ir buscar a
                mesma URL de novo, sem cookie, e receber 404. */}
            <img
              src={`${LISTAGEM}/${linha.id}/assinatura`}
              alt={`Assinatura do checklist ${linha.id}`}
              className="max-h-48 rounded-md border border-slate-700 bg-brand-navy p-2 print:border-0 print:bg-transparent print:invert"
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
 * sem isto, abrir um checklist e voltar significaria refiltrar tudo. O
 * "Excluir checklist" (0066) leva os mesmos filtros, e so aparece para quem o
 * banco deixa excluir (GESTOR): para os demais o botao nao existe, como no
 * sistema antigo. */
async function AcoesDoDetalhe({
  checklistId,
  searchParams,
}: {
  checklistId: number;
  searchParams: Promise<SearchParams>;
}) {
  const [params, podeExcluir] = await Promise.all([searchParams, podeAdministrarUsuarios()]);

  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    const v = primeiro(valor);
    if (v) query.set(chave, v);
  }
  const texto = query.toString();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {podeExcluir && <BotaoExcluirChecklist checklistId={checklistId} filtros={texto} />}
      <Button href={texto ? `${LISTAGEM}?${texto}` : LISTAGEM} variant="secondary" className="group">
        <ChevronLeftIcon className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
        Voltar ao histórico
      </Button>
    </div>
  );
}

function Resumo({ detalhe }: { detalhe: ChecklistDetalhe }) {
  const campos = camposDoResumo(detalhe);

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {campos.map((campo) => (
        <div key={campo.rotulo} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
            {campo.rotulo}
          </dt>
          {/* Travessao no vazio, mesma convencao da DataTable -- celula em
              branco nao distingue "nao preenchido" de "a tela esqueceu". */}
          <dd className="mt-1 break-words text-sm text-white">{campo.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function TabelaDeRespostas({
  checklistId,
  respostas,
}: {
  checklistId: number;
  respostas: ChecklistDetalhe["respostas"];
}) {
  if (respostas.length === 0) {
    return (
      <Vazio
        titulo="Nenhuma resposta registrada"
        descricao="O checklist foi enviado sem nenhuma pergunta respondida."
      />
    );
  }

  return (
    // Focavel por teclado pelo mesmo motivo da `DataTable`: a tabela rola na
    // horizontal abaixo de 720px.
    <div
      role="region"
      aria-label="Respostas do checklist"
      tabIndex={0}
      className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-green"
    >
      <table className="w-full min-w-[880px] border-collapse text-left text-sm">
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
            <th scope="col" className="w-48 whitespace-nowrap px-4 py-3">
              Fotos
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
              <td className="px-4 py-3 text-brand-muted">{resposta.ordem}</td>
              <td className="px-4 py-3 text-white">{resposta.pergunta}</td>
              <td className="px-4 py-3">
                <span className={`font-medium ${corDaResposta(resposta)}`}>{resposta.resposta}</span>
              </td>
              <td className="px-4 py-3 text-brand-muted">{resposta.observacao}</td>
              <td className="px-4 py-3">
                {resposta.fotos.length > 0 ? (
                  <div className="flex gap-2">
                    {resposta.fotos.map((foto) => (
                      <MiniaturaDaFoto key={foto.id} checklistId={checklistId} fotoId={foto.id} tamanho="h-12 w-12" />
                    ))}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * "Nao conforme" em vermelho, que e o que vira nao conformidade no resumo;
 * "Conforme" em verde; o resto neutro. Pelo VALOR gravado e pelo tipo, e nao
 * pelo rotulo: numa pergunta Sim/Nao ("Duvidas com o RH?") o "Nao" nao e
 * defeito do posto, e fica neutro como no app (0061).
 */
function corDaResposta(resposta: ChecklistDetalhe["respostas"][number]): string {
  if (resposta.tipo === "SN") return "text-white";
  if (resposta.valor === "NAO") return "text-red-400";
  if (resposta.valor === "SIM") return "text-brand-green";
  return "text-brand-muted";
}

/** Miniatura que abre a foto inteira numa aba -- a mesma das fotos gerais. */
function MiniaturaDaFoto({
  checklistId,
  fotoId,
  tamanho,
}: {
  checklistId: number;
  fotoId: number;
  tamanho: string;
}) {
  const href = `${LISTAGEM}/${checklistId}/fotos/${fotoId}`;

  return (
    // Link comum e nao <Link>: o destino nao e uma rota de tela, e sim bytes
    // de imagem -- prefetch do roteador nao ajuda e baixaria a foto inteira so
    // por passar o mouse.
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-md border border-slate-800 transition-all duration-200 hover:border-brand-green"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a rota exige a
          sessao de quem pede (ver midia.ts); next/image buscaria sem cookie. */}
      <img src={href} alt={`Foto do checklist ${checklistId}`} className={`${tamanho} bg-brand-navy object-cover`} />
    </a>
  );
}

function Fotos({
  checklistId,
  fotos,
  vazio,
}: {
  checklistId: number;
  fotos: ChecklistDetalhe["fotos"];
  vazio: string;
}) {
  if (fotos.length === 0) {
    return <Vazio titulo="Sem fotos" descricao={vazio} />;
  }

  return (
    <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
      {fotos.map((foto) => (
        <li key={foto.id}>
          <MiniaturaDaFoto checklistId={checklistId} fotoId={foto.id} tamanho="h-40 w-full" />
          <p className="mt-1 text-xs text-brand-muted">{formatarDataHora(foto.criadoEm)}</p>
        </li>
      ))}
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
