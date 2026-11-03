/**
 * Constantes puras da tela de Site / Planta.
 *
 * Mesmo arranjo de `usuarios/constantes.ts`: o formulario em branco mora aqui,
 * e nao em `novo/page.tsx`, porque `valoresParaDuplicar` precisa da mesma base
 * e e regra que merece teste proprio.
 */

/** Formulario de criacao em branco. */
export const VALORES_VAZIOS = {
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
  // Contatos avisados das ocorrencias do site (0065). Nao vai no Duplicar:
  // sao as pessoas de um posto, nao da operacao.
  emailsEventos: "",
  // Campos da 0082, como no sistema de referencia.
  emailsChecklist: "",
  notificarEventos: [] as string[],
  responsavelPerdaId: "",
  responsavelPrevencaoId: "",
  tipoIntervencao: "",
  dataInstalacao: "",
  diasInstalacao: "",
  dataDesinstalacao: "",
  // Os tres seguem os defaults da 0021: site novo recebe visita e gera QR-Code,
  // e nao gera registro em coletas -- este ultimo cria dado, entao o padrao
  // seguro e nao criar.
  recebeVisita: true,
  gerarQrcodeAutomatico: true,
  gerarRegistroColetas: false,
  ativo: true,
};

/** O site como vem do banco, so com o que o formulario usa. */
export type SiteParaFormulario = {
  nome: string;
  sigla: string | null;
  grupo_site_id: number;
  tipo_servico_id: number | null;
  responsavel_id: string | null;
  site_superior_id: number | null;
  regional: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
  observacao: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  pais: string;
  raio_metros: number | null;
  cod_cliente: string | null;
  cod_posto: string | null;
  filial: string | null;
  info_adicional_1: string | null;
  info_adicional_2: string | null;
  emails_eventos: string[];
  emails_checklist: string[];
  notificar_eventos: string[];
  responsavel_perda_id: string | null;
  responsavel_prevencao_id: string | null;
  tipo_intervencao: string | null;
  data_instalacao: string | null;
  dias_instalacao: number | null;
  data_desinstalacao: string | null;
  recebe_visita: boolean;
  gerar_qrcode_automatico: boolean;
  gerar_registro_coletas: boolean;
  ativo: boolean;
};

/** "Tipo Intervenção" do sistema de referencia (CHECK da 0082). */
export const TIPOS_DE_INTERVENCAO = [
  { value: "BARREIRA_TECNOLOGICA", label: "Barreira Tecnológica" },
  { value: "RASTREADORES", label: "Rastreadores" },
  { value: "CADEADO_BLUETOOTH", label: "Cadeado Bluetooth" },
];

/** Mantido pelo nome antigo: o Duplicar recebe o site inteiro. */
export type ModeloParaDuplicar = SiteParaFormulario;

/** O site do banco nos valores do formulario (strings nos selects). */
export function valoresDoSite(site: SiteParaFormulario): typeof VALORES_VAZIOS {
  return {
    nome: site.nome,
    sigla: site.sigla ?? "",
    grupoSiteId: String(site.grupo_site_id),
    tipoServicoId: site.tipo_servico_id === null ? "" : String(site.tipo_servico_id),
    responsavelId: site.responsavel_id ?? "",
    siteSuperiorId: site.site_superior_id === null ? "" : String(site.site_superior_id),
    regional: site.regional ?? "",
    cidade: site.cidade ?? "",
    uf: site.uf ?? "",
    latitude: site.latitude === null ? "" : String(site.latitude),
    longitude: site.longitude === null ? "" : String(site.longitude),
    observacao: site.observacao ?? "",
    cep: site.cep ?? "",
    endereco: site.endereco ?? "",
    numero: site.numero ?? "",
    bairro: site.bairro ?? "",
    complemento: site.complemento ?? "",
    pais: site.pais,
    raioMetros: site.raio_metros === null ? "" : String(site.raio_metros),
    codCliente: site.cod_cliente ?? "",
    codPosto: site.cod_posto ?? "",
    filial: site.filial ?? "",
    infoAdicional1: site.info_adicional_1 ?? "",
    infoAdicional2: site.info_adicional_2 ?? "",
    emailsEventos: site.emails_eventos.join(", "),
    emailsChecklist: site.emails_checklist.join(", "),
    notificarEventos: [...site.notificar_eventos],
    responsavelPerdaId: site.responsavel_perda_id ?? "",
    responsavelPrevencaoId: site.responsavel_prevencao_id ?? "",
    tipoIntervencao: site.tipo_intervencao ?? "",
    dataInstalacao: site.data_instalacao ?? "",
    diasInstalacao: site.dias_instalacao === null ? "" : String(site.dias_instalacao),
    dataDesinstalacao: site.data_desinstalacao ?? "",
    recebeVisita: site.recebe_visita,
    gerarQrcodeAutomatico: site.gerar_qrcode_automatico,
    gerarRegistroColetas: site.gerar_registro_coletas,
    ativo: site.ativo,
  };
}

/**
 * Valores do "Novo Site / Planta" quando se chega por `?duplicar=<id>`: a
 * "Cópia completa" do sistema de referencia, que copia TODOS os campos do
 * site de origem e acrescenta " cópia" ao Nome e ao Nome abreviado (decisao
 * do dono em 03/11/2026, para ficar igual ao antigo; antes so a
 * classificacao era copiada). O sufixo e o que separa os dois na listagem
 * ate a pessoa ajustar o endereco e os codigos.
 *
 * Objeto novo a cada chamada: `VALORES_VAZIOS` e compartilhado, e devolver a
 * mesma referencia deixaria duas telas mexendo no mesmo estado.
 */
export function valoresParaDuplicar(modelo: ModeloParaDuplicar | null): typeof VALORES_VAZIOS {
  if (!modelo) return { ...VALORES_VAZIOS };

  const valores = valoresDoSite(modelo);
  return {
    ...valores,
    nome: `${valores.nome} cópia`,
    sigla: valores.sigla ? `${valores.sigla} cópia` : "",
  };
}
