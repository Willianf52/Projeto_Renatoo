import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  AcoesEsqueleto,
  FiltrosEmLinhaEsqueleto,
  TabelaEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterInput } from "@/components/dashboard/FilterField";
import { AvisoDeSalvo } from "@/components/dashboard/AvisoDeSalvo";
import {
  ExcelIcon,
  FilterIcon,
  PdfIcon,
  PencilIcon,
  PlusCircleIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/dashboard/icons";
import { descricaoDeListaVazia, temFiltroAplicado } from "@/lib/lista-vazia";
import { podeAdministrarGruposDeUsuarios } from "@/lib/permissoes";
import { ExcluirGrupo } from "./ExcluirGrupo";
import {
  extrairFiltros,
  getGruposUsuarios,
  primeiro,
  toListRow,
  COLUNAS_DA_LISTAGEM,
  PAGE_SIZE,
  type SearchParams,
} from "./queries";

// A ultima coluna so existe na tela: a exportacao nao a tem.
/** Sem ID, como na referencia -- a exportacao segue com ele (ver queries.ts). */
const TABLE_COLUMNS = [...COLUNAS_DA_LISTAGEM, "Ações"];
const MIN_WIDTH = "min-w-[820px]";

/** Indice da coluna "Usuarios" em `TABLE_COLUMNS`. */
const COLUNA_DOS_USUARIOS = 2;

type SearchParamsPromise = Promise<SearchParams>;

/**
 * Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components).
 *
 * O toast e o aviso de permissao ficam com `fallback={null}`, e nao com um
 * esqueleto: os dois podem legitimamente nao renderizar nada, entao reservar
 * espaco para eles criaria um buraco que some -- o salto de layout que os
 * esqueletos existem para evitar.
 */
export default function GrupoDeUsuariosPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <AvisoDeSalvo
          searchParams={searchParams}
          listagem="/dashboard/cadastros/grupo-de-usuarios"
          mensagem="Grupo de usuários salvo com sucesso."
        />
      </Suspense>

      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Configurações" }, { label: "Grupo de Usuários" }]} />
      </div>

      <Suspense fallback={null}>
        <AvisoDePermissao />
      </Suspense>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UsersIcon className="h-4 w-4" />
            Grupo de Usuários
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={3} />}>
            <AcoesDoCabecalho searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={TABLE_COLUMNS.length} minWidth={MIN_WIDTH} />}>
          <TabelaDeGrupos searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * A policy de leitura (migration 0006) libera `grupos_usuarios` apenas para
 * gestão. Sem este aviso a tela parece quebrada: mostra a lista vazia e não
 * explica por quê. Mesmo critério da tela de Usuários.
 */
async function AvisoDePermissao() {
  if (await podeAdministrarGruposDeUsuarios()) return null;

  return (
    <p
      className="rounded-lg border border-slate-800 bg-brand-surface px-4 py-3 text-sm text-brand-muted animate-fade-in"
      style={{ animationDelay: "40ms" }}
    >
      Seu nível de acesso não permite administrar grupos de usuários. A lista exige nível Gestor
      ou Supervisor.
    </p>
  );
}

async function AcoesDoCabecalho({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const podeAdministrar = await podeAdministrarGruposDeUsuarios();

  const queryExportacao = filtros.busca ? `?busca=${encodeURIComponent(filtros.busca)}` : "";

  return (
    <div className="flex items-center gap-2">
      <Acao
        titulo="Exportar para Excel"
        href={`/dashboard/cadastros/grupo-de-usuarios/export/excel${queryExportacao}`} tom="excel"
        target="_blank"
      >
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      <Acao
        titulo="Exportar para PDF"
        href={`/dashboard/cadastros/grupo-de-usuarios/export/pdf${queryExportacao}`} tom="pdf"
        target="_blank"
      >
        <PdfIcon className="h-4 w-4" />
      </Acao>
      {podeAdministrar ? (
        <Acao
          titulo="Novo grupo"
          href="/dashboard/cadastros/grupo-de-usuarios/novo" tom="novo"
        >
          <PlusCircleIcon className="h-4 w-4" />
        </Acao>
      ) : (
        <AcaoDesabilitada
          titulo="Novo grupo"
          motivo="você não tem permissão" tom="novo"
        >
          <PlusCircleIcon className="h-4 w-4" />
        </AcaoDesabilitada>
      )}
    </div>
  );
}

/** Mesmo mecanismo das demais telas: form GET, filtros na querystring, sem JS
 * no cliente. */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);

  return (
    <form
      method="get"
      className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end"
    >
      <div className="min-w-0 flex-1">
        <FilterInput label="Filtre por descrição ou código..." name="busca" defaultValue={filtros.busca} />
      </div>

      <Button type="submit" className="group shrink-0 xl:w-52">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function TabelaDeGrupos({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [resultado, podeAdministrar] = await Promise.all([
    getGruposUsuarios(filtros),
    podeAdministrarGruposDeUsuarios(),
  ]);

  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  // Quem nao administra continua vendo o botao, desabilitado: escondê-lo faria
  // a coluna "Ações" aparecer vazia, sem explicar por que.
  const rows = resultado.rows.map((grupo) => [
    ...toListRow(grupo).map((celula, indice) =>
      indice === COLUNA_DOS_USUARIOS ? (
        // Os nomes quebram de linha em vez de esticar a tabela: o grupo com
        // todos os usuarios passava de 1800px, e os botoes de Editar e
        // Excluir ficavam fora da tela (19/10). A celula herda `nowrap` do
        // DataTable; aqui volta ao normal, com teto de largura.
        <div key={grupo.id} className="min-w-[280px] max-w-[560px] whitespace-normal leading-relaxed">
          {celula}
        </div>
      ) : (
        celula
      ),
    ),
    podeAdministrar ? (
      <div key={grupo.id} className="flex items-center gap-2">
        <Acao
          titulo={`Editar ${grupo.nome}`}
          href={`/dashboard/cadastros/grupo-de-usuarios/${grupo.id}/editar`} tom="neutro"
        >
          <PencilIcon className="h-4 w-4" />
        </Acao>
        {/* Migration 0020. Exclusao de verdade, e nao desativacao: este
            cadastro nao tem coluna `ativo` -- ver o cabecalho da migration. */}
        <ExcluirGrupo id={grupo.id} nome={grupo.nome} />
      </div>
    ) : (
      <div key={grupo.id} className="flex items-center gap-2">
        <AcaoDesabilitada
          titulo="Editar grupo"
          motivo="você não tem permissão" tom="neutro"
        >
          <PencilIcon className="h-4 w-4" />
        </AcaoDesabilitada>
        <AcaoDesabilitada
          titulo="Excluir grupo"
          motivo="você não tem permissão" tom="perigo"
        >
          <TrashIcon className="h-4 w-4" />
        </AcaoDesabilitada>
      </div>
    ),
  ]);

  const buildPageHref = (pagina: number) => {
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      const v = primeiro(valor);
      if (v) query.set(chave, v);
    }
    query.set("pagina", String(pagina));
    return `?${query.toString()}`;
  };

  // Tabela vazia sem filtro e cadastro que ainda nao existe, nao busca que
  // nao achou nada (ver `lib/lista-vazia.ts`).
  const filtrado = temFiltroAplicado(params);

  return (
    <DataTable
      columns={TABLE_COLUMNS}
      rows={rows}
      page={filtros.pagina}
      totalPages={totalPages}
      totalItems={resultado.totalItems}
      buildPageHref={buildPageHref}
      minWidth={MIN_WIDTH}
      emptyTitle={filtrado ? "Nenhum grupo de usuários encontrado" : "Nenhum grupo de usuários cadastrado"}
      emptyDescription={descricaoDeListaVazia({
        filtrado,
        podeCadastrar: podeAdministrar,
        descricaoFiltrada: "Ajuste a busca acima para localizar cadastros.",
      })}
    />
  );
}
