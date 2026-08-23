import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { BuildingIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { SiteForm } from "../SiteForm";
import { getOpcoes, getSitesParaSuperior } from "../queries";

const VALORES_VAZIOS = {
  nome: "",
  sigla: "",
  grupoSiteId: "",
  tipoServicoId: "",
  responsavelId: "",
  siteSuperiorId: "",
  regional: "",
  cidade: "",
  uf: "",
  latitude: "",
  longitude: "",
  observacao: "",
  cep: "",
  endereco: "",
  numero: "",
  bairro: "",
  complemento: "",
  // Mesmo default da coluna (migration 0021), para o campo abrir preenchido em
  // vez de exigir que se digite o obvio.
  pais: "Brasil",
  raioMetros: "",
  codCliente: "",
  codPosto: "",
  filial: "",
  infoAdicional1: "",
  infoAdicional2: "",
  // Os tres seguem os defaults da 0021: site novo recebe visita e gera QR-Code,
  // e nao gera registro em coletas -- este ultimo cria dado, entao o padrao
  // seguro e nao criar.
  recebeVisita: true,
  gerarQrcodeAutomatico: true,
  gerarRegistroColetas: false,
  ativo: true,
};

export default async function NovoSitePage() {
  // O RLS ja recusaria o insert, mas seria depois de preencher o formulario
  // inteiro. Quem nao administra nem chega a ver a tela.
  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/cadastros/site-planta");
  }

  const [opcoes, sitesSuperiores] = await Promise.all([getOpcoes(), getSitesParaSuperior()]);

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

        <SiteForm
          valoresIniciais={VALORES_VAZIOS}
          opcoes={opcoes}
          sitesSuperiores={sitesSuperiores}
        />
      </div>
    </div>
  );
}
