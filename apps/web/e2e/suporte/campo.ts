import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@projeto-renatoo/shared";

/**
 * O lado do app de campo, reproduzido com a sessao do INSPETOR.
 *
 * Nao e o app: o Playwright nao dirige React Native. Sao as MESMAS chamadas
 * que `apps/mobile/src/campo/sincronizacao.ts` e `lib/envio-de-checklist.ts`
 * fazem -- upsert de visita, upsert de leituras, upload no bucket e o RPC
 * `registrar_checklist` --, pela chave anonima e com o token do inspetor.
 * Toda escrita passa pelas policies da 0036/0042/0045/0046, que e o que
 * interessa provar antes de o painel ler o resultado.
 *
 * Mudou o contrato de escrita do app? Mude aqui junto, senao este spec passa
 * testando um app que nao existe mais.
 */

type Cliente = SupabaseClient<Database>;

/** PNG 1x1 transparente. Serve de assinatura: o bucket confere tipo e
 * tamanho (0046), nao o desenho. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==",
  "base64",
);

async function idPorNome(cliente: Cliente, tabela: "sites" | "areas", nome: string): Promise<number> {
  const { data, error } = await cliente.from(tabela).select("id").eq("nome", nome).limit(1).maybeSingle();
  if (error || !data) throw new Error(`${tabela} "${nome}" nao encontrado: ${error?.message ?? "sem linha"}`);
  return data.id;
}

export type VisitaRegistrada = { visitaId: number; siteId: number; inicio: Date };

/**
 * Uma ronda completa num site: a visita e as leituras de Inicio e Termino,
 * que e o par de que os relatorios de permanencia tiram a duracao.
 */
export async function registrarRonda(
  inspetor: Cliente,
  { site, minutos }: { site: string; minutos: number },
): Promise<VisitaRegistrada> {
  const { data: sessao } = await inspetor.auth.getUser();
  if (!sessao.user) throw new Error("Cliente do inspetor sem sessao.");

  const siteId = await idPorNome(inspetor, "sites", site);
  const areaInicio = await idPorNome(inspetor, "areas", "Início");
  const areaTermino = await idPorNome(inspetor, "areas", "Término");

  const { data: visita, error: erroDaVisita } = await inspetor
    .from("visitas")
    .upsert(
      { numero_coleta: randomUUID(), site_id: siteId, funcionario_id: sessao.user.id },
      { onConflict: "numero_coleta,site_id", ignoreDuplicates: true },
    )
    .select("id")
    .single();
  if (erroDaVisita) throw new Error(`Visita recusada: ${erroDaVisita.message}`);

  // No passado, e com a hora cheia de segundos zerados: a duracao exibida
  // precisa ser exatamente `minutos`, sem arredondamento de milissegundo.
  const termino = new Date(Date.now() - 5 * 60_000);
  termino.setSeconds(0, 0);
  const inicio = new Date(termino.getTime() - minutos * 60_000);

  const { error: erroDasLeituras } = await inspetor.from("leituras").upsert(
    [
      { visita_id: visita.id, area_id: areaInicio, data_hora: inicio.toISOString() },
      { visita_id: visita.id, area_id: areaTermino, data_hora: termino.toISOString() },
    ],
    { onConflict: "visita_id,area_id,data_hora", ignoreDuplicates: true },
  );
  if (erroDasLeituras) throw new Error(`Leituras recusadas: ${erroDasLeituras.message}`);

  return { visitaId: visita.id, siteId, inicio };
}

/** Fecha a visita com um checklist CORRETIVA: assinatura no bucket, depois o
 * RPC -- a ordem de `enviarChecklist`. Devolve o id do checklist. */
export async function enviarChecklistCorretivo(
  inspetor: Cliente,
  visitaId: number,
  motivo: string,
): Promise<number> {
  const assinaturaPath = `${visitaId}/assinatura-${randomUUID().slice(0, 8)}.png`;

  const { error: erroDoUpload } = await inspetor.storage
    .from("checklists")
    .upload(assinaturaPath, PNG_1X1, { contentType: "image/png", upsert: false });
  if (erroDoUpload) throw new Error(`Upload da assinatura recusado: ${erroDoUpload.message}`);

  const { data, error } = await inspetor.rpc("registrar_checklist", {
    p_visita_id: visitaId,
    p_tipo: "CORRETIVA",
    p_motivo: motivo,
    p_assinatura_path: assinaturaPath,
    p_fotos: [],
    p_respostas: [],
  });
  if (error) throw new Error(`registrar_checklist recusado: ${error.message}`);

  return Number(data);
}

/** Mes (AAAA-MM) de um instante no fuso da operacao -- o mesmo recorte que
 * `registro-de-rondas` aplica com `-03:00`. */
export function mesNoFusoOperacional(instante: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(instante);
  const ano = partes.find((p) => p.type === "year")!.value;
  const mes = partes.find((p) => p.type === "month")!.value;
  return `${ano}-${mes}`;
}
