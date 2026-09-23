import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { FormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { BuildingIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { SiteForm } from "../SiteForm";
import { valoresParaDuplicar } from "../constantes";
import { getOpcoes, getSite, getSitesParaSuperior, primeiro } from "../queries";


/**
 * Pagina sem `async`: com Cache Components, o `await` no corpo bloqueava a
 * navegacao inteira ate as consultas voltarem ("uncached data" no `next dev`).
 * A casca (breadcrumb e cabecalho) sai na hora; o formulario, que depende da
 * sessao e de consultas recortadas por RLS, entra pelo `<Suspense>`. `use cache`
 * nao serve aqui: guardaria no servidor o recorte de um usuario para outro.
 */
type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;

export default function NovoSitePage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Cadastros" }, { label: "Site / Planta" }, { label: "Novo" }]}
        />
      </div>

      <div
        className="max-w-3xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BuildingIcon className="h-4 w-4" />
            Novo Site / Planta
          </h1>
        </div>

        <Suspense fallback={<FormularioEsqueleto campos={12} />}>
          <Formulario searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * `?duplicar=<id>` chega do botao Duplicar da listagem, como no sistema de
 * referencia.
 *
 * O que e copiado e a CLASSIFICACAO do site -- grupo, tipo de servico,
 * responsavel, site superior, praca e as chaves de comportamento. Nome, sigla,
 * coordenada, endereco e codigos vem em branco: sao o que localiza o site, e
 * copia-los produziria dois cadastros que o olho nao distingue na listagem. A
 * regra inteira, com o porque de cada campo, esta em `constantes.ts`.
 */
async function Formulario({ searchParams }: { searchParams: SearchParamsPromise }) {
  // O RLS ja recusaria o insert, mas seria depois de preencher o formulario
  // inteiro. Quem nao administra nem chega a ver a tela.
  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/cadastros/site-planta");
  }

  const idParaDuplicar = Number(primeiro((await searchParams).duplicar));

  const [opcoes, sitesSuperiores, modelo] = await Promise.all([
    getOpcoes(),
    getSitesParaSuperior(),
    Number.isInteger(idParaDuplicar) && idParaDuplicar > 0
      ? getSite(idParaDuplicar)
      : Promise.resolve(null),
  ]);

  // Modelo que sumiu entre a listagem e o clique cai no formulario em branco:
  // a tela e "Novo Site / Planta" de qualquer jeito, e barrar a criacao por
  // causa de um atalho quebrado seria pior que perder o preenchimento.
  const valoresIniciais = valoresParaDuplicar(modelo);

  return (
    <SiteForm valoresIniciais={valoresIniciais} opcoes={opcoes} sitesSuperiores={sitesSuperiores} />
  );
}
