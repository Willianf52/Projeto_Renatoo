"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { lerListaDeEmails } from "@/lib/lista-de-emails";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { esquemaDeTexto, lerCoordenada, lerRaio } from "./esquema";

const LISTAGEM = "/dashboard/cadastros/site-planta";

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
  /** "E-mails Eventos" (0065), como digitado: separados por virgula ou linha. */
  emailsEventos: string;
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
    emailsEventos: texto(formData, "emails_eventos"),
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
  emails_eventos: string[];
  recebe_visita: boolean;
  gerar_qrcode_automatico: boolean;
  gerar_registro_coletas: boolean;
  ativo: boolean;
};

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

  // Mesmo teto do CHECK `sites_emails_eventos_validos` (0065).
  const emails = lerListaDeEmails(valores.emailsEventos, 20, "e-mails de eventos");
  if (!emails.ok) return emails;

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
      emails_eventos: emails.emails,
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
  redirect(`${LISTAGEM}?salvo=1`);
}
