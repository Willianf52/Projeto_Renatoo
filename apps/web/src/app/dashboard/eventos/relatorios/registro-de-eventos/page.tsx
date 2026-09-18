import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  AcoesEsqueleto,
  FiltrosEmGradeEsqueleto,
  TabelaEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import {
  ChevronRightIcon,
  ClipboardListIcon,
  ExcelIcon,
  FilterIcon,
  PdfIcon,
  SearchIcon,
} from "@/components/dashboard/icons";
import {
  BASES_DE_DATA,
  extrairFiltros,
  formatarPercentual,
  getOpcoesFiltros,
  getRegistroDeEventos,
  primeiro,
  TABLE_COLUMNS,
  type Filtros,
  type LinhaDeEvento,
  type SearchParams,
} from "./queries";

const MIN_WIDTH = "min-w-[880px]";
const COLUNAS_DA_TELA = [...TABLE_COLUMNS, "Ações"];

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components). */
export default function RegistroDeEventosPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Relatórios" }, { label: "Registro de Eventos" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Registro de Eventos
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={2} />}>
            <AcoesDeExportacao searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={7} colunas="xl:grid-cols-4" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={5} linhas={6} minWidth={MIN_WIDTH} />}>
          <CorpoDoRegistro searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** Mesmos filtros da tela, sem a paginacao -- exportar traz o periodo inteiro,
 * nao so a pagina visivel. */
function montarQueryDeExportacao(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (chave === "pagina") continue;
    const v = primeiro(valor);
    if (v) query.set(chave, v);
  }
  const texto = query.toString();
  return texto ? `?${texto}` : "";
}

async function AcoesDeExportacao({ searchParams }: { searchParams: SearchParamsPromise }) {
  const queryExportacao = montarQueryDeExportacao(await searchParams);

  return (
    <div className="flex items-center gap-2">
      <Acao
        titulo="Exportar para Excel"
        href={`/dashboard/eventos/relatorios/registro-de-eventos/export/excel${queryExportacao}`}
        className="bg-emerald-600/40"
        target="_blank"
      >
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      <Acao
        titulo="Exportar para PDF"
        href={`/dashboard/eventos/relatorios/registro-de-eventos/export/pdf${queryExportacao}`}
        className="bg-red-600/40"
        target="_blank"
      >
        <PdfIcon className="h-4 w-4" />
      </Acao>
    </div>
  );
}

/**
 * GET nativo, mesmo mecanismo das demais telas. Duas linhas com a largura de
 * cada campo escolhida a mao (e nao uma grade regular) para acompanhar a
 * referencia: datas estreitas, Sites ocupando o resto da primeira linha, e o
 * Filtrar ao lado dos selects na segunda.
 */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const opcoes = await getOpcoesFiltros();

  return (
    <form method="get" className="space-y-3 border-b border-slate-800 p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="w-full lg:w-44">
          <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
        </div>
        <div className="w-full lg:w-44">
          <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
        </div>
        <div className="w-full lg:w-52">
          {/* Nao e um filtro de valor: escolhe sobre QUAL data o periodo acima
              recorta. Sem opcao vazia porque "nenhuma das duas" nao existe --
              alguma coluna a consulta tem de usar. */}
          <FilterSelect
            label="Base da data"
            name="base_data"
            defaultValue={filtros.baseDeData}
            options={BASES_DE_DATA}
            semOpcaoVazia
          />
        </div>
        <div className="min-w-0 flex-1">
          <FilterSelect label="Sites" name="sites" defaultValue={filtros.sites} options={opcoes.sites} />
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1">
          <FilterSelect label="Eventos" name="evento" defaultValue={filtros.evento} options={opcoes.eventos} />
        </div>
        <div className="min-w-0 flex-1">
          <FilterSelect label="Usuários" name="usuario" defaultValue={filtros.usuario} options={opcoes.usuarios} />
        </div>
        <div className="w-full lg:w-44">
          {/* Sem situacao de tratativa no schema: nem `leituras` nem `eventos`
              guardam em que pe esta a ocorrencia (pendente/resolvida). O campo
              fica visivel, como na referencia, mas sem opcao nenhuma -- mesma
              decisao do "Checklists" em Registro das Rondas. Ligar isto exige
              migration nova, nao mudanca de tela. */}
          <FilterSelect label="Status" name="status" options={[]} />
        </div>
        <Button type="submit" className="group w-full lg:w-40">
          <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
          Filtrar
        </Button>
      </div>
    </form>
  );
}

/**
 * Link de "Ações": as coletas que originaram a linha, em Coletas Importadas.
 *
 * O periodo so vai junto quando o relatorio esta recortando por DATA DO
 * EVENTO: Coletas Importadas filtra por `data_hora` e nao por
 * `data_integracao`, entao mandar as mesmas datas no modo "Data de Inserção"
 * abriria uma lista que nao bate com a Quantidade da linha. Sem as datas a
 * lista vem mais larga -- larga e verdadeira e melhor que estreita e errada.
 */
function hrefDasColetas(filtros: Filtros, linha: LinhaDeEvento): string {
  const query = new URLSearchParams({ local: String(linha.siteId), evento: String(linha.eventoId) });
  if (filtros.baseDeData === "evento") {
    if (filtros.dataInicial) query.set("data_inicial", filtros.dataInicial);
    if (filtros.dataFinal) query.set("data_final", filtros.dataFinal);
  }
  return `/dashboard/inspecoes/coletas-importadas?${query.toString()}`;
}

async function CorpoDoRegistro({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);
  const registro = await getRegistroDeEventos(filtros);

  if (!registro) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center animate-fade-in-up">
        <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
          <SearchIcon className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-white">Selecione um período</p>
        <p className="text-sm text-brand-muted">
          Escolha a Data Inicial e a Data Final acima e clique em Filtrar para ver o registro de eventos.
        </p>
      </div>
    );
  }

  // Sem paginacao: a referencia lista todos os pares Site x Evento do periodo
  // numa tabela so, com o TOTAL no pe. O resultado ja vem agregado -- sao
  // dezenas de linhas, nao milhares --, e paginar esconderia justamente a
  // cauda que a coluna "%" ajuda a comparar.
  const linhas = registro.linhas.map((linha) => [
    <CaminhoDoSite key="site" niveis={linha.siteNiveis} />,
    linha.eventoNome,
    <Centro key="quantidade">{linha.quantidade}</Centro>,
    <Centro key="percentual">{formatarPercentual(linha.percentual)}</Centro>,
    <Centro key="acoes">
      <Acao
        titulo={`Ver as coletas de ${linha.eventoNome} em ${linha.siteNome}`}
        href={hrefDasColetas(filtros, linha)}
        className="mx-auto hover:bg-white/10"
      >
        <SearchIcon className="h-4 w-4" />
      </Acao>
    </Centro>,
  ]);

  return (
    <DataTable
      columns={COLUNAS_DA_TELA}
      rows={linhas}
      // O TOTAL e do filtro inteiro, nao da pagina: e a soma que a coluna "%"
      // usa como base, entao mostrar o subtotal da pagina faria as
      // porcentagens nao fecharem em 100%.
      rodape={[
        "TOTAL:",
        "",
        <Centro key="quantidade">{registro.total}</Centro>,
        <Centro key="percentual">{formatarPercentual(registro.total > 0 ? 100 : 0)}</Centro>,
        "",
      ]}
      page={1}
      totalPages={1}
      totalItems={registro.linhas.length}
      emptyTitle="Nenhum evento encontrado"
      emptyDescription="Ajuste o período ou os filtros acima para localizar registros."
      minWidth={MIN_WIDTH}
      rotulo="Registro de eventos"
    />
  );
}

/** "UP Serviços > Grupo > Site" com o chevron da referencia entre os niveis.
 * O ultimo nivel (o site em si) em destaque; os de cima, esmaecidos. */
function CaminhoDoSite({ niveis }: { niveis: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {niveis.map((nivel, indice) => {
        const ultimo = indice === niveis.length - 1;
        return (
          <span key={indice} className="inline-flex items-center gap-1">
            {indice > 0 && <ChevronRightIcon className="h-3.5 w-3.5 text-brand-muted" aria-hidden />}
            <span className={ultimo ? "text-white" : "text-brand-muted"}>{nivel}</span>
          </span>
        );
      })}
    </span>
  );
}

/** Quantidade, "%" e a lupa ficam centralizados na coluna, como na referencia.
 * A `DataTable` nao tem alinhamento por coluna; um bloco centralizado dentro da
 * celula resolve sem mexer nela. */
function Centro({ children }: { children: React.ReactNode }) {
  return <span className="flex justify-center">{children}</span>;
}
