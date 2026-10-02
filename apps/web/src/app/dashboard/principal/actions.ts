"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TAMANHO_DA_GRADE, type AtalhoFixado } from "@/lib/atalhos";
import { createClient } from "@/lib/supabase/server";
import { TELAS_DO_MENU } from "@/components/dashboard/telas-do-menu";

const ROTAS_DO_MENU = new Set(TELAS_DO_MENU.map((tela) => tela.href));

/**
 * O que chega aqui e montado pela tela, mas o POST pode ser feito a mao: so
 * rota que existe no menu, posicao dentro da grade, sem repetir nem uma nem
 * outra. O banco confere de novo (constraints da 0062).
 */
const esquema = z
  .array(
    z.object({
      rota: z.string().refine((rota) => ROTAS_DO_MENU.has(rota), "Tela inválida."),
      posicao: z.number().int().min(0).max(TAMANHO_DA_GRADE - 1),
    }),
  )
  .max(TAMANHO_DA_GRADE)
  .refine(
    (lista) =>
      new Set(lista.map((a) => a.rota)).size === lista.length &&
      new Set(lista.map((a) => a.posicao)).size === lista.length,
    "Atalho repetido.",
  );

/** Troca o conjunto inteiro de fixados. Lista vazia e o "Restaurar padrão". */
export async function salvarAtalhosFixados(fixados: AtalhoFixado[]): Promise<{ erro?: string }> {
  const validado = esquema.safeParse(fixados);
  if (!validado.success) return { erro: "Não foi possível salvar os atalhos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_atalhos_fixados", { p_atalhos: validado.data });

  if (error) {
    return {
      erro:
        error.code === "42501"
          ? "Sua conta não pode personalizar os atalhos."
          : "Não foi possível salvar os atalhos. Tente de novo.",
    };
  }

  revalidatePath("/dashboard/principal");
  return {};
}
