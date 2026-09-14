import { useEffect, useState } from "react";
import Constants from "expo-constants";

import { env } from "./env";
import { consultarVersaoMinima, precisaAtualizar } from "./versao-minima";

/**
 * Pergunta o piso de versao ao painel, uma vez por abertura do app.
 *
 * COMECA LIBERADO E SO FECHA DEPOIS DA RESPOSTA. O estado inicial e
 * `bloqueado: false`, entao a consulta nao atrasa nem pisca nada para o
 * inspetor que esta em dia -- que e o caso de 15 em 15 aparelhos no dia a dia.
 * Quem esta atrasado ve a tela aparecer um instante depois da abertura, e
 * esse instante e aceitavel: o custo do contrario seria segurar TODO mundo
 * numa espera de rede para pegar o caso raro.
 *
 * UMA VEZ, NA MONTAGEM. Nao ha revalidacao por AppState como em
 * `useCicloDeVidaDaSessao`: o piso muda em escala de semanas e a versao
 * instalada nao muda com o app aberto. Reperguntar a cada volta do segundo
 * plano seria trafego sem nenhuma pergunta nova.
 *
 * A versao sai de `expo-constants`, que le o `version` do `app.json` -- a
 * mesma string que o EAS usa para nomear o build. Ilegivel (o que nao deve
 * acontecer, mas o tipo admite), nao bloqueia: um app que nao sabe a propria
 * versao nao pode concluir que esta velho.
 */
export function usePisoDeVersao(): { bloqueado: boolean; minima: string | null } {
  const [minima, setMinima] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    void consultarVersaoMinima(env.urlDoPortal).then((resposta) => {
      if (ativo) setMinima(resposta);
    });

    return () => {
      ativo = false;
    };
  }, []);

  const instalada = Constants.expoConfig?.version;

  return {
    bloqueado: instalada ? precisaAtualizar(instalada, minima) : false,
    minima,
  };
}
