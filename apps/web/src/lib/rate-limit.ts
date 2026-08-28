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
 * conta propria, e o limite efetivo vira `limite x numero de instancias`.
 *
 * E esse **e** o ambiente atual, nao uma hipotese futura: producao roda
 * serverless na Vercel, e cada invocacao pode cair numa instancia diferente,
 * cada uma com o seu proprio `Map`. Nenhum numero configurado aqui vale
 * literalmente -- o limite real e sempre maior, e quanto maior depende de
 * quantas instancias a plataforma mantiver quentes, que nao esta sob controle
 * deste codigo. A decisao de nao pagar um round-trip ao Postgres por
 * requisicao segue de pe pelo motivo do paragrafo anterior; o que nao vale e
 * ler o limite como exato. Quando o volume justificar, a correcao e mover o
 * contador para armazenamento compartilhado.
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

/**
 * Identifica quem chama, para compor a chave do balde.
 *
 * NAO usar o primeiro item de `x-forwarded-for`, que e o que este arquivo
 * fazia ate a auditoria de 2026-08-18. Cada proxy ACRESCENTA o endereco de
 * quem falou com ele no fim da lista, entao o item mais a esquerda e o que o
 * proprio cliente mandou -- texto arbitrario, inventavel a cada requisicao.
 * Com ele como chave, o limite deixa de existir para exatamente quem ele foi
 * criado para conter: quem tem o segredo (vazado ou nao) e decide inundar a
 * rota trocava o header e ganhava um balde novo por requisicao.
 *
 * O ultimo item e o que o proxy confiavel na nossa frente escreveu -- o unico
 * que o cliente nao controla. `x-real-ip` vem antes na ordem de preferencia
 * porque a Vercel e o nginx o escrevem eles mesmos e ele nao e uma cadeia, so
 * um endereco: nao ha o que escolher errado.
 *
 * Sem nenhum dos dois (ambiente sem proxy na frente), cai numa chave fixa:
 * pior que discriminar por IP, melhor que nao limitar nada.
 */
export const CHAMADOR_DESCONHECIDO = "sem-ip";

/**
 * O aviso do fallback sai uma vez por processo, nao por requisicao.
 *
 * Na Vercel os dois headers sempre chegam, entao este caminho e teorico --
 * mas se ele passar a ser exercitado (deploy self-hosted, proxy mal
 * configurado), TODO mundo divide o mesmo balde e um chamador esgota o limite
 * dos outros. Sem sinal nenhum isso aparece como "a rota comecou a devolver
 * 429 sem motivo", que e caro de diagnosticar. Achado B-3 da auditoria de
 * 28/08.
 *
 * `console.warn` e nao o `erro()` de `lib/log.ts` de proposito: aquele importa
 * o Sentry, e este modulo e puro -- sem dependencia de rede ou de framework --,
 * o que e justamente o que permite testa-lo com `environment: node`. Uma
 * flag de modulo evita repetir a linha a cada requisicao.
 */
let avisouFallback = false;

export function identificarChamador(request: { headers: { get(nome: string): string | null } }): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const cadeia = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean);

  const ultimo = cadeia.at(-1);
  if (ultimo) return ultimo;

  if (!avisouFallback) {
    avisouFallback = true;
    console.warn(
      "[rate-limit] Nem x-real-ip nem x-forwarded-for presentes: o limite de taxa " +
        "passa a valer para todos os chamadores somados, e nao por IP. " +
        "Confira se ha um proxy confiavel na frente da aplicacao.",
    );
  }

  return CHAMADOR_DESCONHECIDO;
}
