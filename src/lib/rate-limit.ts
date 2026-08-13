/**
 * Limite de requisicoes por janela fixa, em memoria.
 *
 * As duas rotas que autenticam por segredo compartilhado (`/api/importar/coletas`,
 * `/api/webhooks/user-updated`) nao tinham nenhum limite: o segredo barra quem
 * nao o conhece, mas nao limita quem o conhece e decide (ou tem o segredo
 * vazado e alguem mais decide) inundar a rota. O login tem o mesmo problema em
 * teoria, mas na pratica o `signInWithPassword` fala direto com o Supabase
 * Auth a partir do navegador -- nao ha rota nossa no meio para interceptar, e
 * o proprio GoTrue ja aplica limite no lado dele. Duplicar isso aqui exigiria
 * proxiar o login inteiro pelo nosso backend, uma mudanca de arquitetura bem
 * maior que "adicionar um limite".
 *
 * Em memoria, nao em banco: as duas rotas esperam uma unica integracao
 * conhecida como chamadora, nao trafego publico de muitos clientes -- um
 * `Map` por processo e suficiente para o problema real (segredo vazado
 * inundando a rota), e um round-trip a mais ao Postgres a cada requisicao
 * para guardar contador seria caro pelo beneficio que traz aqui.
 *
 * Limitacao registrada, nao escondida: o contador e por processo. Atras de
 * mais de uma instancia (varias replicas do servidor), cada uma conta por
 * conta propria, e o limite efetivo vira `limite x numero de instancias`. Para
 * o ambiente atual (processo unico) o limite vale exatamente como configurado.
 */

type Balde = { contagem: number; expiraEm: number };

const baldes = new Map<string, Balde>();

export type ResultadoDoLimite =
  | { permitido: true }
  | { permitido: false; tenteNovamenteEmSegundos: number };

/**
 * `chave` tipicamente combina a rota com o identificador de quem chama (IP),
 * para o limite de uma rota nao consumir o de outra por engano.
 */
export function limitarTaxa(chave: string, limite: number, janelaMs: number): ResultadoDoLimite {
  const agora = Date.now();
  const atual = baldes.get(chave);

  if (!atual || atual.expiraEm <= agora) {
    // Aproveita a checagem para descartar baldes vencidos de outras chaves --
    // sem isso o Map cresceria sem limite conforme IPs diferentes aparecem.
    for (const [k, v] of baldes) {
      if (v.expiraEm <= agora) baldes.delete(k);
    }

    baldes.set(chave, { contagem: 1, expiraEm: agora + janelaMs });
    return { permitido: true };
  }

  if (atual.contagem >= limite) {
    return { permitido: false, tenteNovamenteEmSegundos: Math.ceil((atual.expiraEm - agora) / 1000) };
  }

  atual.contagem += 1;
  return { permitido: true };
}

/** `x-forwarded-for` pode trazer uma lista ("cliente, proxy1, proxy2") -- o
 * primeiro endereco e o mais proximo do cliente real. Sem o header (ambiente
 * sem proxy na frente), cai numa chave fixa: pior que discriminar por IP,
 * melhor que nao limitar nada. */
export function identificarChamador(request: { headers: { get(nome: string): string | null } }): string {
  const encaminhado = request.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  return "sem-ip";
}
