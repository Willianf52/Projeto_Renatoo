import "server-only";

import { createHash } from "node:crypto";
import { erro } from "@/lib/log";
import { limitarTaxaEmMemoria, type ResultadoDoLimite } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Limite de taxa com o contador no Postgres (migration 0048).
 *
 * P1-3 da auditoria de 11/09. O `Map` de `lib/rate-limit.ts` contava por
 * instancia, e em serverless isso quer dizer que o limite configurado em cada
 * rota nao era o limite que valia. Aqui todas as instancias consomem o mesmo
 * balde, numa unica instrucao atomica do banco.
 *
 * FALHA PARA A CONTINGENCIA, NAO PARA O ERRO. Sem service_role no ambiente, ou
 * com o banco fora, a rota cai no `Map` por instancia: limite frouxo, mas
 * limite. As duas alternativas sao piores -- recusar tudo derruba as rotas
 * junto com o limitador (inclusive `/api/health`, que existe justamente para
 * dizer que o banco caiu), e liberar tudo desliga a protecao no momento em que
 * alguem pode estar forcando a queda.
 *
 * A CHAVE VAI COM HASH. As rotas compoem `rota:ip`; o banco so ve o sha256
 * disso. IP e dado pessoal, e o contador nao precisa dele em claro para contar.
 *
 * `server-only`: importa a service_role. Ver `lib/supabase/admin.ts`.
 */

/** Um aviso de contingencia por minuto por instancia, no maximo. Com o banco
 * fora, cada requisicao limitada cairia aqui -- sem teto, o log e o Sentry
 * virariam a segunda vitima da mesma queda. */
const INTERVALO_ENTRE_AVISOS_MS = 60_000;
let ultimoAviso = 0;

function avisarContingencia(motivo: string, detalhe?: unknown) {
  const agora = Date.now();
  if (agora - ultimoAviso < INTERVALO_ENTRE_AVISOS_MS) return;
  ultimoAviso = agora;

  erro(
    "rate-limit",
    `Limite de taxa compartilhado indisponivel (${motivo}); usando o contador por instancia.`,
    detalhe,
  );
}

export function hashDaChave(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

export async function limitarTaxa(
  chave: string,
  limite: number,
  janelaMs: number,
): Promise<ResultadoDoLimite> {
  let cliente: ReturnType<typeof createAdminClient>;
  try {
    cliente = createAdminClient();
  } catch (excecao) {
    avisarContingencia("service_role ausente", excecao);
    return limitarTaxaEmMemoria(chave, limite, janelaMs);
  }

  try {
    const { data, error } = await cliente.rpc("consumir_limite_de_taxa", {
      p_chave: hashDaChave(chave),
      p_limite: limite,
      p_janela_ms: janelaMs,
    });

    // `typeof` e nao so `error`: uma resposta sem erro e sem numero (proxy no
    // meio, contrato mudado) nao pode virar "permitido" por omissao.
    if (error || typeof data !== "number") {
      avisarContingencia("rpc recusada", error ?? { data });
      return limitarTaxaEmMemoria(chave, limite, janelaMs);
    }

    return data === 0 ? { permitido: true } : { permitido: false, tenteNovamenteEmSegundos: data };
  } catch (excecao) {
    avisarContingencia("falha de rede", excecao);
    return limitarTaxaEmMemoria(chave, limite, janelaMs);
  }
}

/** So para os testes: zera o teto de avisos entre um caso e outro. */
export function reiniciarAvisosParaTeste() {
  ultimoAviso = 0;
}
