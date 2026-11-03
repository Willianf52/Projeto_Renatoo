/**
 * As configuracoes da conta que o portal usa (Cadastros > Cliente, migration
 * 0085). Lidas por quem gera PDF, envia e-mail ou grava andamento; se a
 * leitura falhar, valem os padroes -- uma configuracao nunca derruba um envio.
 */

export type ConfiguracaoDoCliente = {
  nomeFantasia: string;
  tituloPdf: string;
  nomeFantasiaNoRemetente: boolean;
  legendaNasImagens: boolean;
  minCaracteresDescricao: number;
  minCaracteresAcoes: number;
};

export const CONFIGURACAO_PADRAO: ConfiguracaoDoCliente = {
  nomeFantasia: "",
  tituloPdf: "",
  nomeFantasiaNoRemetente: false,
  legendaNasImagens: true,
  minCaracteresDescricao: 0,
  minCaracteresAcoes: 0,
};

type Linha = {
  nome_fantasia: string;
  titulo_pdf: string | null;
  nome_fantasia_no_remetente: boolean;
  legenda_nas_imagens: boolean;
  min_caracteres_descricao: number;
  min_caracteres_acoes: number;
};

/** Qualquer cliente Supabase (sessao ou service_role) que leia `cliente`. */
type ClienteSupabase = {
  from: (tabela: "cliente") => {
    select: (colunas: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> };
  };
};

export async function lerConfiguracaoDoCliente(supabase: unknown): Promise<ConfiguracaoDoCliente> {
  try {
    const { data, error } = await (supabase as ClienteSupabase)
      .from("cliente")
      .select(
        "nome_fantasia, titulo_pdf, nome_fantasia_no_remetente, legenda_nas_imagens, min_caracteres_descricao, min_caracteres_acoes",
      )
      .maybeSingle();
    if (error || !data) return CONFIGURACAO_PADRAO;
    const l = data as Linha;
    return {
      nomeFantasia: l.nome_fantasia ?? "",
      tituloPdf: l.titulo_pdf ?? "",
      nomeFantasiaNoRemetente: Boolean(l.nome_fantasia_no_remetente),
      legendaNasImagens: l.legenda_nas_imagens !== false,
      minCaracteresDescricao: l.min_caracteres_descricao ?? 0,
      minCaracteresAcoes: l.min_caracteres_acoes ?? 0,
    };
  } catch {
    return CONFIGURACAO_PADRAO;
  }
}

/**
 * "Usar Nome Fantasia no FROM dos emails": troca o nome de exibicao do
 * remetente ("Up Servicos <avisos@...>") pelo nome fantasia, mantendo o
 * endereco. Sem endereco entre `<>`, ou sem nome, devolve como veio. Pura.
 */
export function remetenteComNome(remetente: string, config: ConfiguracaoDoCliente): string {
  const nome = config.nomeFantasia.replace(/[<>"\r\n]/g, "").trim();
  if (!config.nomeFantasiaNoRemetente || !nome) return remetente;
  const endereco = remetente.match(/<([^>]+)>/)?.[1];
  return endereco ? `${nome} <${endereco}>` : remetente;
}
