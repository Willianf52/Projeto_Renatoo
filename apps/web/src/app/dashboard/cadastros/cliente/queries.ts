import { createClient } from "@/lib/supabase/server";

/** Cadastros > Cliente (0085): a linha da conta e os numeros da lista. */

export const LISTAGEM = "/dashboard/cadastros/cliente";

export type Cliente = {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  ramoAtividade: string;
  logotipoPath: string | null;
  ativo: boolean;
  tituloPdf: string;
  nomeFantasiaNoRemetente: boolean;
  legendaNasImagens: boolean;
  minCaracteresDescricao: number;
  minCaracteresAcoes: number;
  criadoEm: string;
};

export type NumerosDoCliente = { usuariosAtivos: number; usuarios: number; sites: number; sitesAtivos: number };

/** "12345678000190" -> "12.345.678/0001-90". Pura. */
export function cnpjFormatado(cnpj: string): string {
  return /^\d{14}$/.test(cnpj) ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : cnpj;
}

export async function getCliente(): Promise<Cliente | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente")
    .select(
      `nome_fantasia, razao_social, cnpj, ramo_atividade, logotipo_path, ativo, titulo_pdf, nome_fantasia_no_remetente,
       legenda_nas_imagens, min_caracteres_descricao, min_caracteres_acoes, criado_em`,
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    nomeFantasia: data.nome_fantasia,
    razaoSocial: data.razao_social ?? "",
    cnpj: data.cnpj ?? "",
    ramoAtividade: data.ramo_atividade ?? "",
    logotipoPath: data.logotipo_path,
    ativo: data.ativo,
    tituloPdf: data.titulo_pdf ?? "",
    nomeFantasiaNoRemetente: data.nome_fantasia_no_remetente,
    legendaNasImagens: data.legenda_nas_imagens,
    minCaracteresDescricao: data.min_caracteres_descricao,
    minCaracteresAcoes: data.min_caracteres_acoes,
    criadoEm: data.criado_em,
  };
}

/** Os numeros da lista do antigo: usuarios e sites, no total e ativos. */
export async function getNumerosDoCliente(): Promise<NumerosDoCliente> {
  const supabase = await createClient();
  const contar = async (tabela: "profiles" | "sites", soAtivos: boolean) => {
    let q = supabase.from(tabela).select("id", { count: "exact", head: true });
    if (soAtivos) q = q.eq("ativo", true);
    const { count } = await q;
    return count ?? 0;
  };
  const [usuarios, usuariosAtivos, sites, sitesAtivos] = await Promise.all([
    contar("profiles", false),
    contar("profiles", true),
    contar("sites", false),
    contar("sites", true),
  ]);
  return { usuarios, usuariosAtivos, sites, sitesAtivos };
}
