import { dataValida } from "@/lib/data-hora";
import { createClient } from "@/lib/supabase/server";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/**
 * Filtros da tela de referencia. Periodo por Data Inicial/Final (e nao
 * Mês/Ano, como o Mapa de Eventos). "Status" nao entra aqui: o schema nao
 * guarda situacao de tratativa da ocorrencia -- ver o comentario do campo em
 * page.tsx.
 */
export type Filtros = {
  dataInicial?: string;
  dataFinal?: string;
  grupoUsuario?: string;
  sites?: string;
  evento?: string;
  usuario?: string;
};

export function extrairFiltros(params: SearchParams): Filtros {
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
    grupoUsuario: primeiro(params.grupo_usuario),
    sites: primeiro(params.sites),
    evento: primeiro(params.evento),
    usuario: primeiro(params.usuario),
  };
}

/** O periodo so esta completo com as duas datas -- como em Registro de
 * Eventos e Mapa de Locais, a tela nao consulta sem ele. */
export function temPeriodo(filtros: Filtros): boolean {
  return Boolean(filtros.dataInicial && filtros.dataFinal);
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
  gruposUsuarios: Opcao[];
  sites: Opcao[];
  eventos: Opcao[];
  usuarios: Opcao[];
};

type SiteComGrupo = { id: number; nome: string; grupos_sites: { nome: string } | null };

function paraOpcoes(linhas: { id: number | string; nome: string | null }[] | null): Opcao[] {
  return (linhas ?? []).map((linha) => ({ value: String(linha.id), label: linha.nome ?? "" }));
}

/** Sem cache manual, pelo mesmo motivo dos demais relatorios: `sites`,
 * `profiles` e `grupos_usuarios` sao recortados por RLS conforme quem pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();

  const [gruposUsuarios, sites, eventos, usuarios] = await Promise.all([
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);

  return {
    gruposUsuarios: paraOpcoes(gruposUsuarios.data),
    // "Grupo - Site", como no Registro de Eventos e no Mapa de Eventos.
    sites: ((sites.data ?? []) as unknown as SiteComGrupo[]).map((site) => ({
      value: String(site.id),
      label: site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome,
    })),
    eventos: paraOpcoes(eventos.data),
    usuarios: paraOpcoes((usuarios.data ?? []).map((u) => ({ id: u.id, nome: u.nome_completo }))),
  };
}
