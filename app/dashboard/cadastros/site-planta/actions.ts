"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const LISTAGEM = "/dashboard/cadastros/site-planta";

/** Limites de aplicacao, nao do banco -- mesmo criterio de
 * `grupo-de-sites/actions.ts`: recusam colagem acidental de texto enorme, nao
 * regra de negocio. `uf` e a excecao: e `char(2)` no banco (migration 0003). */
const LIMITE_NOME = 200;
const LIMITE_SIGLA = 20;
const LIMITE_REGIONAL = 100;
const LIMITE_CIDADE = 100;
const LIMITE_OBSERVACAO = 1000;

export type ValoresDoSite = {
  nome: string;
  sigla: string;
  grupoSiteId: string;
  tipoServicoId: string;
  responsavelId: string;
  regional: string;
  cidade: string;
  uf: string;
  latitude: string;
  longitude: string;
  observacao: string;
  ativo: boolean;
};

export type EstadoDoFormulario = {
  erro?: string;
  /** Devolvido para o formulario nao perder o que a pessoa digitou. */
  valores?: ValoresDoSite;
};

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

function extrairValores(formData: FormData): ValoresDoSite {
  return {
    nome: texto(formData, "nome"),
    sigla: texto(formData, "sigla"),
    grupoSiteId: texto(formData, "grupo_site_id"),
    tipoServicoId: texto(formData, "tipo_servico_id"),
    responsavelId: texto(formData, "responsavel_id"),
    regional: texto(formData, "regional"),
    cidade: texto(formData, "cidade"),
    uf: texto(formData, "uf").toUpperCase(),
    latitude: texto(formData, "latitude"),
    longitude: texto(formData, "longitude"),
    observacao: texto(formData, "observacao"),
    // Checkbox nao marcado nao e enviado pelo navegador -- ausencia e "false".
    ativo: formData.get("ativo") !== null,
  };
}

/**
 * Coordenada: vazia e valida e significa "ainda nao cadastrada" (migration
 * 0003), nao zero. Aceita virgula como separador decimal -- e o que sai de um
 * teclado em pt-BR, e recusar seria pedantismo.
 */
function lerCoordenada(
  valor: string,
  rotulo: string,
  maximo: number,
): { ok: true; valor: number | null } | { ok: false; erro: string } {
  if (valor === "") return { ok: true, valor: null };

  const numero = Number(valor.replace(",", "."));
  if (!Number.isFinite(numero)) return { ok: false, erro: `${rotulo} deve ser um número.` };
  if (Math.abs(numero) > maximo) {
    return { ok: false, erro: `${rotulo} deve estar entre -${maximo} e ${maximo}.` };
  }

  return { ok: true, valor: numero };
}

type LinhaDoSite = {
  nome: string;
  sigla: string | null;
  grupo_site_id: number;
  tipo_servico_id: number | null;
  responsavel_id: string | null;
  regional: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
  observacao: string | null;
  ativo: boolean;
};

function validar(
  valores: ValoresDoSite,
): { ok: true; linha: LinhaDoSite } | { ok: false; erro: string } {
  if (!valores.nome) return { ok: false, erro: "Informe o nome do site." };
  if (valores.nome.length > LIMITE_NOME) {
    return { ok: false, erro: `O nome deve ter no máximo ${LIMITE_NOME} caracteres.` };
  }
  if (valores.sigla.length > LIMITE_SIGLA) {
    return { ok: false, erro: `A sigla deve ter no máximo ${LIMITE_SIGLA} caracteres.` };
  }
  if (valores.regional.length > LIMITE_REGIONAL) {
    return { ok: false, erro: `A regional deve ter no máximo ${LIMITE_REGIONAL} caracteres.` };
  }
  if (valores.cidade.length > LIMITE_CIDADE) {
    return { ok: false, erro: `A cidade deve ter no máximo ${LIMITE_CIDADE} caracteres.` };
  }
  if (valores.observacao.length > LIMITE_OBSERVACAO) {
    return {
      ok: false,
      erro: `A observação deve ter no máximo ${LIMITE_OBSERVACAO} caracteres.`,
    };
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

  const latitude = lerCoordenada(valores.latitude, "A latitude", 90);
  if (!latitude.ok) return latitude;

  const longitude = lerCoordenada(valores.longitude, "A longitude", 180);
  if (!longitude.ok) return longitude;

  // Uma coordenada sozinha nao localiza nada, e a tela de coletas mostra o par.
  if ((latitude.valor === null) !== (longitude.valor === null)) {
    return { ok: false, erro: "Informe latitude e longitude juntas, ou deixe as duas em branco." };
  }

  return {
    ok: true,
    linha: {
      nome: valores.nome,
      sigla: valores.sigla || null,
      grupo_site_id: grupoSiteId,
      tipo_servico_id: tipoServicoId,
      responsavel_id: valores.responsavelId || null,
      regional: valores.regional || null,
      cidade: valores.cidade || null,
      uf: valores.uf || null,
      latitude: latitude.valor,
      longitude: longitude.valor,
      observacao: valores.observacao || null,
      ativo: valores.ativo,
    },
  };
}

/** `(grupo_site_id, nome)` e unique (migration 0012). Sem esta traducao o
 * usuario receberia o texto cru do Postgres, que cita o nome da constraint e
 * nao explica nada. */
const CODIGO_NOME_DUPLICADO = "23505";

/** INSERT barrado pelo RLS. Diferente do UPDATE, que passa em silencio, o
 * insert falha alto -- e a mensagem generica ("tente novamente") faria a
 * pessoa repetir a acao para sempre, porque tentar de novo nao resolve. */
const CODIGO_SEM_PERMISSAO = "42501";

/** FK apontando para registro inexistente: grupo ou tipo de servico apagado
 * entre o carregamento do formulario e o envio. */
const CODIGO_FK_INVALIDA = "23503";

function traduzirErro(codigo: string | undefined): string {
  if (codigo === CODIGO_NOME_DUPLICADO) {
    return "Já existe um site com esse nome neste grupo.";
  }
  if (codigo === CODIGO_SEM_PERMISSAO) {
    return "Você não tem permissão para cadastrar sites.";
  }
  if (codigo === CODIGO_FK_INVALIDA) {
    return "Grupo, tipo de serviço ou responsável não existe mais. Recarregue a página.";
  }
  return "Não foi possível salvar o site. Tente novamente.";
}

export async function salvarSite(
  _estado: EstadoDoFormulario,
  formData: FormData,
): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);

  const validacao = validar(valores);
  if (!validacao.ok) return { erro: validacao.erro, valores };

  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isInteger(id)) {
    return { erro: "Registro inválido.", valores };
  }

  const supabase = await createClient();

  if (id === null) {
    const { error } = await supabase.from("sites").insert(validacao.linha);

    if (error) return { erro: traduzirErro(error.code), valores };
  } else {
    /**
     * O `.select()` nao e enfeite, mesmo motivo de `grupo-de-sites/actions.ts`:
     * um UPDATE barrado pelo RLS nao devolve erro, devolve zero linhas
     * alteradas. Sem conferir isso, quem nao tem permissao veria a mensagem de
     * sucesso e voltaria para a listagem com o registro intacto.
     */
    const { data, error } = await supabase
      .from("sites")
      .update(validacao.linha)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return { erro: traduzirErro(error.code), valores };

    if (!data) {
      return {
        erro: "Você não tem permissão para editar este site, ou ele não existe mais.",
        valores,
      };
    }
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}
