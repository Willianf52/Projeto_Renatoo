import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { ClipboardListIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { getOpcoesDeModelos } from "../../modelos/queries";
import { PerguntaForm } from "../PerguntaForm";
import { getProximaOrdem, modeloDoFiltro } from "../queries";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Pagina sem `async`: com Cache Components, o `await` no corpo (permissao e
 * consultas recortadas por RLS) travava a navegacao ate tudo voltar -- ver
 * `site-planta/novo/page.tsx`.
 */
export default function NovaPerguntaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={5} />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // O RLS (policy da 0043) ja recusaria o insert, mas seria depois de
  // preencher o formulario inteiro. Quem nao administra nem chega a ver a tela.
  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/checklistlab/perguntas");
  }

  // O modelo vem da listagem (`?modelo=`), que o botao "Nova pergunta" leva
  // quando ela esta filtrada; sem ele, o padrao. E so o valor inicial do
  // select -- a ordem sugerida vale para ele, e trocar de modelo no
  // formulario pode pedir outro numero (o erro de ordem repetida explica).
  const [params, modelos] = await Promise.all([searchParams, getOpcoesDeModelos()]);
  const pedido = modeloDoFiltro(Array.isArray(params.modelo) ? params.modelo[0] : params.modelo);
  const modelo =
    modelos.find((opcao) => Number(opcao.value) === pedido) ?? modelos.find((opcao) => opcao.padrao);

  const proximaOrdem = modelo ? await getProximaOrdem(Number(modelo.value)) : 1;

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[
            { label: "ChecklistLab" },
            { label: "Perguntas do Checklist" },
            { label: "Nova" },
          ]}
        />
      </div>

      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Nova Pergunta do Checklist
          </h1>
        </div>

        <PerguntaForm
          modelos={modelos}
          valoresIniciais={{
            texto: "",
            ordem: String(proximaOrdem),
            ativo: true,
            modelo: modelo?.value ?? "",
            tipoResposta: "CNA",
          }}
        />
      </div>
    </div>
  );
}
