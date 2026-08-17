"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";

const LISTAGEM = "/dashboard/cadastros/site-planta";

/**
 * Limites de aplicacao, nao do banco -- recusam colagem acidental de texto
 * enorme, nao regra de negocio. `uf` e a excecao: e `char(2)` no banco
 * (migration 0003), validada a parte por regex.
 *
 * Limite e mensagem vivem juntos, campo a campo, em vez de dois mapas
 * paralelos (limites + rotulos) percorridos por um loop -- era exatamente o
 * formato onde "esqueci de adicionar o campo novo em um dos dois mapas"
 * virava um bug silencioso (campo sem limite, ou limite sem mensagem).
 *
 * `codCliente`/`codPosto`/`filial` (migration 0021) ficam folgados de
 * proposito: sao chaves de sistemas de terceiros, formato desconhecido.
 */
const esquemaDeTexto = z.object({
  nome: z.string().min(1, "Informe o nome do site.").max(200, "O nome deve ter no máximo 200 caracteres."),
  sigla: z.string().max(20, "A sigla deve ter no máximo 20 caracteres."),
  regional: z.string().max(100, "A regional deve ter no máximo 100 caracteres."),
  cidade: z.string().max(100, "A cidade deve ter no máximo 100 caracteres."),
  observacao: z.string().max(1000, "A observação deve ter no máximo 1000 caracteres."),
  // Sem mascara de formato de proposito: o cadastro tambem atende endereco
  // fora do Brasil, e um padrao de 8 digitos recusaria um CEP legitimo.
  cep: z.string().max(20, "O CEP deve ter no máximo 20 caracteres."),
  endereco: z.string().max(200, "O endereço deve ter no máximo 200 caracteres."),
  numero: z.string().max(20, "O número deve ter no máximo 20 caracteres."),
  bairro: z.string().max(100, "O bairro deve ter no máximo 100 caracteres."),
  complemento: z.string().max(100, "O complemento deve ter no máximo 100 caracteres."),
  pais: z.string().max(60, "O país deve ter no máximo 60 caracteres."),
  codCliente: z.string().max(50, "O código do cliente deve ter no máximo 50 caracteres."),
  codPosto: z.string().max(50, "O código do posto deve ter no máximo 50 caracteres."),
  filial: z.string().max(50, "A filial deve ter no máximo 50 caracteres."),
  infoAdicional1: z.string().max(200, "A informação adicional 1 deve ter no máximo 200 caracteres."),
  infoAdicional2: z.string().max(200, "A informação adicional 2 deve ter no máximo 200 caracteres."),
});

export type ValoresDoSite = {
  nome: string;
  sigla: string;
  grupoSiteId: string;
  tipoServicoId: string;
  responsavelId: string;
  siteSuperiorId: string;
  regional: string;
  cidade: string;
  uf: string;
  // Migration 0025 -- de volta apos a remocao da 0022, so em `sites`.
  latitude: string;
  longitude: string;
  observacao: string;
  cep: string;
  endereco: string;
  numero: string;
  bairro: string;
  complemento: string;
  pais: string;
  raioMetros: string;
  codCliente: string;
  codPosto: string;
  filial: string;
  infoAdicional1: string;
  infoAdicional2: string;
  recebeVisita: boolean;
  gerarQrcodeAutomatico: boolean;
  gerarRegistroColetas: boolean;
  ativo: boolean;
};

export type EstadoDoFormulario = {
  erro?: string;
  /** Devolvido para o formulario nao perder o que a pessoa digitou. */
  valores?: ValoresDoSite;
};

function extrairValores(formData: FormData): ValoresDoSite {
  return {
    nome: texto(formData, "nome"),
    sigla: texto(formData, "sigla"),
    grupoSiteId: texto(formData, "grupo_site_id"),
    tipoServicoId: texto(formData, "tipo_servico_id"),
    responsavelId: texto(formData, "responsavel_id"),
    siteSuperiorId: texto(formData, "site_superior_id"),
    regional: texto(formData, "regional"),
    cidade: texto(formData, "cidade"),
    uf: texto(formData, "uf").toUpperCase(),
    latitude: texto(formData, "latitude"),
    longitude: texto(formData, "longitude"),
    observacao: texto(formData, "observacao"),
    cep: texto(formData, "cep"),
    endereco: texto(formData, "endereco"),
    numero: texto(formData, "numero"),
    bairro: texto(formData, "bairro"),
    complemento: texto(formData, "complemento"),
    pais: texto(formData, "pais"),
    raioMetros: texto(formData, "raio_metros"),
    codCliente: texto(formData, "cod_cliente"),
    codPosto: texto(formData, "cod_posto"),
    filial: texto(formData, "filial"),
    infoAdicional1: texto(formData, "info_adicional_1"),
    infoAdicional2: texto(formData, "info_adicional_2"),
    // Checkbox nao marcado nao e enviado pelo navegador -- ausencia e "false".
    recebeVisita: formData.get("recebe_visita") !== null,
    gerarQrcodeAutomatico: formData.get("gerar_qrcode_automatico") !== null,
    gerarRegistroColetas: formData.get("gerar_registro_coletas") !== null,
    // "status" e um Select ("ativo"/"inativo"), nao um checkbox -- ver
    // grupo-de-sites/actions.ts, mesmo padrao.
    ativo: String(formData.get("status") ?? "") !== "inativo",
  };
}

type LinhaDoSite = {
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
  recebe_visita: boolean;
  gerar_qrcode_automatico: boolean;
  gerar_registro_coletas: boolean;
  ativo: boolean;
};

/**
 * Raio de tolerancia em metros. Vazio e valido (sem raio definido); negativo
 * nao e -- raio negativo nao quer dizer nada, e o banco aceitaria.
 */
function lerRaio(valor: string): { ok: true; valor: number | null } | { ok: false; erro: string } {
  if (valor === "") return { ok: true, valor: null };

  const numero = Number(valor);
  if (!Number.isInteger(numero)) {
    return { ok: false, erro: "O raio deve ser um número inteiro de metros." };
  }
  if (numero < 0) return { ok: false, erro: "O raio não pode ser negativo." };

  return { ok: true, valor: numero };
}

/**
 * Coordenada opcional (migration 0025). Vazio e "nao informada"; preenchido
 * precisa estar dentro do intervalo valido -- o banco (`numeric(10,7)`)
 * aceitaria qualquer numero de ate 3 digitos antes da virgula, mas 91 de
 * latitude nao significa nada.
 */
function lerCoordenada(
  valor: string,
  limite: number,
  rotulo: string,
): { ok: true; valor: number | null } | { ok: false; erro: string } {
  if (valor === "") return { ok: true, valor: null };

  // Aceita virgula decimal: e o separador que o teclado numerico do celular
  // produz em pt-BR, e o "GPS" do formulario grava com ponto -- os dois
  // precisam entrar.
  const numero = Number(valor.replace(",", "."));
  if (!Number.isFinite(numero)) {
    return { ok: false, erro: `${rotulo} deve ser um número.` };
  }
  if (numero < -limite || numero > limite) {
    return { ok: false, erro: `${rotulo} deve estar entre -${limite} e ${limite}.` };
  }

  return { ok: true, valor: numero };
}

/**
 * `id` do site em edicao, para barrar o site apontar para si mesmo como
 * superior. O banco tambem barra (constraint da 0021), mas la a mensagem seria
 * o texto cru do Postgres.
 */
function validar(
  valores: ValoresDoSite,
  idEmEdicao: number | null,
): { ok: true; linha: LinhaDoSite } | { ok: false; erro: string } {
  const textoValidado = esquemaDeTexto.safeParse(valores);
  if (!textoValidado.success) {
    return { ok: false, erro: textoValidado.error.issues[0].message };
  }

  // `uf` e char(2) no banco: um valor maior seria truncado em silencio pelo
  // Postgres, e o cadastro sairia com a UF errada sem ninguem perceber.
  if (valores.uf !== "" && !/^[A-Z]{2}$/.test(valores.uf)) {
    return { ok: false, erro: "A UF deve ter exatamente 2 letras (ex: RS)." };
  }

  const grupoSiteId = Number(valores.grupoSiteId);
  if (!valores.grupoSiteId || !Number.isInteger(grupoSiteId)) {
    return { ok: false, erro: "Selecione o grupo de sites." };
  }

  // Os dois seguintes sao opcionais no banco (FK com `on delete set null`),
  // entao vazio e um valor legitimo -- mas preenchido tem que ser um id.
  let tipoServicoId: number | null = null;
  if (valores.tipoServicoId) {
    tipoServicoId = Number(valores.tipoServicoId);
    if (!Number.isInteger(tipoServicoId)) {
      return { ok: false, erro: "Tipo de serviço inválido." };
    }
  }

  let siteSuperiorId: number | null = null;
  if (valores.siteSuperiorId) {
    siteSuperiorId = Number(valores.siteSuperiorId);
    if (!Number.isInteger(siteSuperiorId)) {
      return { ok: false, erro: "Site superior inválido." };
    }
    if (idEmEdicao !== null && siteSuperiorId === idEmEdicao) {
      return { ok: false, erro: "Um site não pode ser superior de si mesmo." };
    }
  }

  const raio = lerRaio(valores.raioMetros);
  if (!raio.ok) return raio;

  const latitude = lerCoordenada(valores.latitude, 90, "A latitude");
  if (!latitude.ok) return latitude;

  const longitude = lerCoordenada(valores.longitude, 180, "A longitude");
  if (!longitude.ok) return longitude;

  return {
    ok: true,
    linha: {
      nome: valores.nome,
      sigla: valores.sigla || null,
      grupo_site_id: grupoSiteId,
      tipo_servico_id: tipoServicoId,
      responsavel_id: valores.responsavelId || null,
      site_superior_id: siteSuperiorId,
      regional: valores.regional || null,
      cidade: valores.cidade || null,
      uf: valores.uf || null,
      latitude: latitude.valor,
      longitude: longitude.valor,
      observacao: valores.observacao || null,
      cep: valores.cep || null,
      endereco: valores.endereco || null,
      numero: valores.numero || null,
      bairro: valores.bairro || null,
      complemento: valores.complemento || null,
      // `pais` e `not null default 'Brasil'` no banco: campo em branco cai no
      // mesmo default, em vez de virar erro por algo que ninguem digitou.
      pais: valores.pais || "Brasil",
      raio_metros: raio.valor,
      cod_cliente: valores.codCliente || null,
      cod_posto: valores.codPosto || null,
      filial: valores.filial || null,
      info_adicional_1: valores.infoAdicional1 || null,
      info_adicional_2: valores.infoAdicional2 || null,
      recebe_visita: valores.recebeVisita,
      gerar_qrcode_automatico: valores.gerarQrcodeAutomatico,
      gerar_registro_coletas: valores.gerarRegistroColetas,
      ativo: valores.ativo,
    },
  };
}

/** `(grupo_site_id, nome)` e unique (migration 0012). */
const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe um site com esse nome neste grupo.",
  semPermissao: "Você não tem permissão para cadastrar sites.",
  fkInvalida: "Grupo, tipo de serviço ou responsável não existe mais. Recarregue a página.",
  generico: "Não foi possível salvar o site. Tente novamente.",
};

export async function salvarSite(
  _estado: EstadoDoFormulario,
  formData: FormData,
): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);

  // O id vem antes da validacao porque ela precisa dele: um site nao pode
  // apontar para si mesmo como superior.
  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isInteger(id)) {
    return { erro: "Registro inválido.", valores };
  }

  const validacao = validar(valores, id);
  if (!validacao.ok) return { erro: validacao.erro, valores };

  const supabase = await createClient();

  if (id === null) {
    const { error } = await supabase.from("sites").insert(validacao.linha);

    if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO), valores };
  } else {
    // `.select()` nao e enfeite -- ver `lib/escrita-rls.ts`: um UPDATE barrado
    // pelo RLS nao devolve erro, devolve zero linhas alteradas.
    const resultado = await supabase.from("sites").update(validacao.linha).eq("id", id).select("id").maybeSingle();

    const verificacao = verificarEscritaComRls(
      resultado,
      MENSAGENS_DE_ERRO,
      "Você não tem permissão para editar este site, ou ele não existe mais.",
    );
    if (!verificacao.ok) return { erro: verificacao.erro, valores };
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}
