import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { AvisoDeSalvo } from "@/components/dashboard/AvisoDeSalvo";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { DataTable } from "@/components/dashboard/DataTable";
import { TabelaEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { BuildingIcon, PencilIcon } from "@/components/dashboard/icons";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { cnpjFormatado, getCliente, getNumerosDoCliente, LISTAGEM } from "./queries";

type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;

/** As colunas da lista de Cliente do sistema de referencia, menos as de
 * modulos que o portal nao tem (Grupo de contas, NPS, Usuarios Contratados). */
const COLUNAS = [
  "Logo",
  "Nome Fantasia",
  "Razão Social",
  "CNPJ",
  "Data Cadastro",
  "Usuários",
  "Usuários Ativos",
  "Sites",
  "Sites Ativos",
  "Limita Caracteres?",
  "Status",
  "Ações",
];
const MIN_WIDTH = "min-w-[1100px]";
const DATA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

/** Cadastros > Cliente (0085). Pagina sem `async` (Cache Components). */
export default function ClientePage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <AvisoDeSalvo searchParams={searchParams} listagem={LISTAGEM} mensagem="Cliente salvo com sucesso." />
      </Suspense>
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Cliente" }]} />
      </div>
      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BuildingIcon className="h-4 w-4" />
            Cliente
          </h1>
        </div>
        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS.length} linhas={1} minWidth={MIN_WIDTH} />}>
          <Tabela />
        </Suspense>
      </div>
    </div>
  );
}

async function Tabela() {
  const [cliente, numeros, pode] = await Promise.all([getCliente(), getNumerosDoCliente(), podeAdministrarUsuarios()]);
  const linhas = cliente
    ? [
        [
          cliente.logotipoPath ? (
            // eslint-disable-next-line @next/next/no-img-element -- bytes do bucket privado sob a sessao (rota propria)
            <img key="logo" src={`${LISTAGEM}/logotipo`} alt="Logotipo" className="h-8 w-auto max-w-[96px] object-contain" />
          ) : (
            ""
          ),
          cliente.nomeFantasia,
          cliente.razaoSocial,
          cnpjFormatado(cliente.cnpj),
          DATA.format(new Date(cliente.criadoEm)),
          String(numeros.usuarios),
          String(numeros.usuariosAtivos),
          String(numeros.sites),
          String(numeros.sitesAtivos),
          cliente.minCaracteresDescricao > 0 || cliente.minCaracteresAcoes > 0 ? "Sim" : "Não",
          cliente.ativo ? "Ativo" : "Inativo",
          pode ? (
            <Acao key="editar" titulo="Editar cliente" href={`${LISTAGEM}/editar`} tom="neutro">
              <PencilIcon className="h-4 w-4" />
            </Acao>
          ) : (
            <AcaoDesabilitada key="editar" titulo="Editar cliente" motivo="apenas Gestor" tom="neutro">
              <PencilIcon className="h-4 w-4" />
            </AcaoDesabilitada>
          ),
        ],
      ]
    : [];

  return (
    <DataTable
      columns={COLUNAS}
      rows={linhas}
      page={1}
      totalPages={1}
      totalItems={linhas.length}
      buildPageHref={() => LISTAGEM}
      emptyTitle="Cadastro do cliente indisponível"
      emptyDescription="Somente a gestão vê o cadastro do cliente."
      minWidth={MIN_WIDTH}
      rotulo="Cliente"
    />
  );
}
