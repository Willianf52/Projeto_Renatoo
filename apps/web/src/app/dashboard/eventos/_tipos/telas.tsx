import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { AvisoDeSalvo } from "@/components/dashboard/AvisoDeSalvo";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  AcoesEsqueleto,
  PaginaDeFormularioEsqueleto,
  TabelaEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { PencilIcon, PlusCircleIcon, SlidersIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { podeConfigurarEventos } from "@/lib/permissoes";
import { CADASTROS, COR_PADRAO, type TipoDeCadastro } from "./config";
import { buscarTipo, listarTipos, type LinhaDoTipo } from "./queries";
import { TipoForm } from "./TipoForm";

type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;

const COLUNAS = ["Nome", "Cor", "Status", "Ações"];
const MIN_WIDTH = "min-w-[560px]";

/**
 * Listagem. Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` (Cache Components): cada pedaco faz
 * o proprio `await` dentro de `<Suspense>`.
 */
export function ListaDeTipos({ tipo, searchParams }: { tipo: TipoDeCadastro; searchParams: SearchParamsPromise }) {
  const cadastro = CADASTROS[tipo];

  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <AvisoDeSalvo searchParams={searchParams} listagem={cadastro.rota} mensagem={cadastro.salvo} />
      </Suspense>

      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: cadastro.titulo }]} />
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
            <SlidersIcon className="h-4 w-4" />
            {cadastro.titulo}
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={1} />}>
            <BotaoNovo tipo={tipo} />
          </Suspense>
        </div>

        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS.length} minWidth={MIN_WIDTH} />}>
          <TabelaDeTipos tipo={tipo} />
        </Suspense>
      </div>
    </div>
  );
}

/** A leitura e de GESTOR e SUPERVISOR (0064); a escrita, so do GESTOR (0071).
 * Sem o aviso, o SUPERVISOR veria os botoes apagados sem saber por que. */
async function AvisoDePermissao() {
  if (await podeConfigurarEventos()) return null;

  return (
    <p className="rounded-lg border border-slate-800 bg-brand-surface px-4 py-3 text-sm text-brand-muted animate-fade-in">
      Você pode consultar esta lista. Cadastrar e editar é só para o nível Gestor.
    </p>
  );
}

async function BotaoNovo({ tipo }: { tipo: TipoDeCadastro }) {
  const cadastro = CADASTROS[tipo];

  if (await podeConfigurarEventos()) {
    return (
      <Acao titulo={`Novo ${cadastro.singular.toLowerCase()}`} href={`${cadastro.rota}/novo`} className="bg-amber-500/80">
        <PlusCircleIcon className="h-4 w-4" />
      </Acao>
    );
  }

  return (
    <AcaoDesabilitada titulo={`Novo ${cadastro.singular.toLowerCase()}`} motivo="você não tem permissão" className="bg-amber-500/40">
      <PlusCircleIcon className="h-4 w-4" />
    </AcaoDesabilitada>
  );
}

function AmostraDeCor({ cor }: { cor: string | null }) {
  if (!cor) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="h-4 w-4 rounded border border-white/20" style={{ backgroundColor: cor }} />
      <span className="font-mono text-xs text-brand-muted">{cor}</span>
    </span>
  );
}

async function TabelaDeTipos({ tipo }: { tipo: TipoDeCadastro }) {
  const cadastro = CADASTROS[tipo];
  const [tipos, podeEditar] = await Promise.all([listarTipos(tipo), podeConfigurarEventos()]);

  const linhas = tipos.map((linha: LinhaDoTipo) => [
    linha.nome,
    <AmostraDeCor key="cor" cor={linha.cor} />,
    linha.ativo ? "Ativo" : "Inativo",
    podeEditar ? (
      <Acao key="acoes" titulo={`Editar ${linha.nome}`} href={`${cadastro.rota}/${linha.id}/editar`} className="bg-white/10">
        <PencilIcon className="h-4 w-4" />
      </Acao>
    ) : (
      <AcaoDesabilitada key="acoes" titulo={`Editar ${linha.nome}`} motivo="você não tem permissão" className="bg-white/10">
        <PencilIcon className="h-4 w-4" />
      </AcaoDesabilitada>
    ),
  ]);

  return (
    <DataTable
      columns={COLUNAS}
      rows={linhas}
      page={1}
      totalPages={1}
      totalItems={tipos.length}
      minWidth={MIN_WIDTH}
      emptyTitle={`Nenhum ${cadastro.singular.toLowerCase()} cadastrado`}
      emptyDescription={podeEditar ? "Use o botão acima para cadastrar o primeiro." : "Peça ao Gestor para cadastrar."}
    />
  );
}

/** Novo e Editar: o mesmo cartao, com o `Conteudo` dentro de `<Suspense>`. */
function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up" style={{ animationDelay: "80ms" }}>
      <div className="border-b border-slate-800 px-4 py-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
          <SlidersIcon className="h-4 w-4" />
          {titulo}
        </h1>
      </div>
      {children}
    </div>
  );
}

export function NovoTipo({ tipo }: { tipo: TipoDeCadastro }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={3} />}>
      <ConteudoNovo tipo={tipo} />
    </Suspense>
  );
}

async function ConteudoNovo({ tipo }: { tipo: TipoDeCadastro }) {
  const cadastro = CADASTROS[tipo];
  // O RLS recusaria o insert, mas so depois de preencher o formulario.
  if (!(await podeConfigurarEventos())) redirect(cadastro.rota);

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: cadastro.titulo }, { label: "Novo" }]} />
      </div>
      <Cartao titulo={`Novo ${cadastro.singular}`}>
        <TipoForm tipo={tipo} valoresIniciais={{ nome: "", cor: COR_PADRAO, ativo: true }} />
      </Cartao>
    </div>
  );
}

export function EditarTipo({ tipo, params }: { tipo: TipoDeCadastro; params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={3} />}>
      <ConteudoEditar tipo={tipo} params={params} />
    </Suspense>
  );
}

async function ConteudoEditar({ tipo, params }: { tipo: TipoDeCadastro; params: Promise<{ id: string }> }) {
  const cadastro = CADASTROS[tipo];
  const id = idNaUrl((await params).id);
  if (id === null) notFound();
  if (!(await podeConfigurarEventos())) redirect(cadastro.rota);

  const linha = await buscarTipo(tipo, id);
  if (!linha) notFound();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: cadastro.titulo }, { label: linha.nome }]} />
      </div>
      <Cartao titulo={`Editar ${cadastro.singular}`}>
        <TipoForm
          tipo={tipo}
          id={linha.id}
          valoresIniciais={{ nome: linha.nome, cor: linha.cor ?? COR_PADRAO, ativo: linha.ativo }}
        />
      </Cartao>
    </div>
  );
}
