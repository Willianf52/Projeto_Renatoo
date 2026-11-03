"use server";

import { revalidatePath } from "next/cache";
import { lerCsv } from "@/lib/csv";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { podeEditarChecklist } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { planejarImportacao } from "../importacao";
import { AGENDAMENTOS, LISTAGEM } from "../regras";

const TAMANHO_MAXIMO = 512 * 1024;

export type EstadoDaImportacao = {
  erro?: string;
  criadas?: number;
  erros?: { linha: number; mensagem: string }[];
};

/**
 * "Importar Agendas" com as colunas da planilha do sistema de referencia (ver
 * `../importacao.ts`). Tudo ou nada na conferencia: com uma linha com erro,
 * nenhuma agenda entra. Depois, cada agenda grava pela `salvar_agenda` (0084).
 */
export async function importarAgendas(_estado: EstadoDaImportacao, formData: FormData): Promise<EstadoDaImportacao> {
  if (!(await podeEditarChecklist())) return { erro: "Você não tem permissão para criar agendas." };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo .csv com as agendas." };
  if (!arquivo.name.toLowerCase().endsWith(".csv")) {
    return { erro: "O arquivo precisa ser .csv. No Excel: Arquivo › Salvar como › CSV." };
  }
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "O arquivo passa de 512 KB. Divida em arquivos menores." };

  const bytes = await arquivo.arrayBuffer();
  let textoDoArquivo: string;
  try {
    textoDoArquivo = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    textoDoArquivo = new TextDecoder("windows-1252").decode(bytes);
  }

  const supabase = await createClient();
  const [modelos, sites, usuarios, grupos] = await Promise.all([
    supabase.from("modelos_checklist").select("id, nome").eq("ativo", true),
    supabase.from("sites").select("id, nome").eq("ativo", true),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true),
    supabase.from("grupos_usuarios").select("id, nome"),
  ]);

  const plano = planejarImportacao(lerCsv(textoDoArquivo), {
    modelos: modelos.data ?? [],
    sites: sites.data ?? [],
    usuarios: (usuarios.data ?? []).map((u) => ({ id: u.id, nome: u.nome_completo ?? "" })),
    grupos: grupos.data ?? [],
  });
  if (!plano.ok) return { erro: plano.erro };
  if (plano.erros.length > 0) {
    return { erro: "Nenhuma agenda foi importada. Corrija as linhas abaixo e envie de novo.", erros: plano.erros };
  }

  let criadas = 0;
  for (const a of plano.agendas) {
    const { error } = await supabase.rpc("salvar_agenda", {
      p_id: null as unknown as number,
      p_nome: a.nome,
      p_modelo_id: a.modeloId,
      p_responsavel_id: a.responsavelId as string,
      p_grupo_usuario_id: a.grupoUsuarioId as number,
      p_data_inicial: a.dataInicial,
      p_data_final: a.dataFinal,
      p_recorrencia: a.recorrencia,
      p_tolerancia_dias: a.toleranciaDias,
      p_ativo: true,
      p_sites: a.sites,
    });
    if (error) {
      registrarErro(gerarIdDeRequisicao(), "Importar agendas: falha ao gravar:", error);
      revalidatePath(LISTAGEM);
      return { erro: `A agenda "${a.nome}" não pôde ser gravada; ${criadas} entraram antes dela. Confira a lista.`, criadas };
    }
    criadas += 1;
  }

  revalidatePath(LISTAGEM);
  revalidatePath(AGENDAMENTOS);
  return { criadas };
}
