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
  // Os tres seguem os defaults da 0021: site novo recebe visita e gera QR-Code,
  // e nao gera registro em coletas -- este ultimo cria dado, entao o padrao
  // seguro e nao criar.
  recebeVisita: true,
  gerarQrcodeAutomatico: true,
  gerarRegistroColetas: false,
  ativo: true,
};

/** O que o site de origem empresta no Duplicar -- nada que o localize. */
export type ModeloParaDuplicar = {
  grupo_site_id: number;
  tipo_servico_id: number | null;
  responsavel_id: string | null;
  site_superior_id: number | null;
  regional: string | null;
  cidade: string | null;
  uf: string | null;
  pais: string;
  filial: string | null;
  raio_metros: number | null;
  recebe_visita: boolean;
  gerar_qrcode_automatico: boolean;
  gerar_registro_coletas: boolean;
  ativo: boolean;
};

/**
 * Valores do "Novo Site / Planta" quando se chega por `?duplicar=<id>`, como o
 * botao Duplicar do sistema de referencia.
 *
 * A DIVISAO E ENTRE CLASSIFICACAO E ENDERECO. Copia o que diz a que operacao o
 * site pertence -- grupo, tipo de servico, responsavel, site superior,
 * regional, cidade, UF, pais, filial, raio, as tres chaves de comportamento
 * (recebe visita, gera QR-Code, gera registro em coletas) e a situacao.
 *
 * Deixa em branco o que aponta para um lugar especifico: nome, sigla,
 * latitude, longitude, CEP e o endereco inteiro, os codigos de cliente e de
 * posto, a observacao e as duas informacoes adicionais. Sao justamente os
 * campos que, copiados, produziriam dois cadastros que o olho nao distingue na
 * listagem -- e um QR-Code colado na parede errada.
 *
 * Cidade e UF vao junto de proposito, apesar de fazerem parte do endereco: o
 * caso que motiva duplicar e outro posto do mesmo cliente na mesma praca, e
 * sao dois campos faceis de corrigir quando nao for.
 *
 * A situacao acompanha inclusive quando a origem esta inativa -- mesmo
 * raciocinio de `usuarios/constantes.ts`: duplicar um cadastro desativado e
 * como se prepara o que ainda nao entrou em operacao.
 *
 * Objeto novo a cada chamada: `VALORES_VAZIOS` e compartilhado, e devolver a
 * mesma referencia deixaria duas telas mexendo no mesmo estado.
 */
export function valoresParaDuplicar(modelo: ModeloParaDuplicar | null): typeof VALORES_VAZIOS {
  if (!modelo) return { ...VALORES_VAZIOS };

  return {
    ...VALORES_VAZIOS,
    grupoSiteId: String(modelo.grupo_site_id),
    tipoServicoId: modelo.tipo_servico_id === null ? "" : String(modelo.tipo_servico_id),
    responsavelId: modelo.responsavel_id ?? "",
    siteSuperiorId: modelo.site_superior_id === null ? "" : String(modelo.site_superior_id),
    regional: modelo.regional ?? "",
    cidade: modelo.cidade ?? "",
    uf: modelo.uf ?? "",
    // Sem `?? "Brasil"`: a coluna e `not null` com default, entao o valor da
    // origem ja e o certo -- e um site cadastrado em outro pais continuaria
    // nele ao ser duplicado.
    pais: modelo.pais,
    filial: modelo.filial ?? "",
    raioMetros: modelo.raio_metros === null ? "" : String(modelo.raio_metros),
    recebeVisita: modelo.recebe_visita,
    gerarQrcodeAutomatico: modelo.gerar_qrcode_automatico,
    gerarRegistroColetas: modelo.gerar_registro_coletas,
    ativo: modelo.ativo,
  };
}
