import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { supabase } from "../lib/supabase";
import { decidirAcao } from "./ciclo-de-vida";

/**
 * Amarra a sessao do Supabase ao ciclo de vida do app.
 *
 * POR QUE ISTO EXISTE: `autoRefreshToken: true` (packages/shared/supabase-client.ts)
 * renova o token por um `setInterval`. Em React Native esse timer e suspenso
 * quando o app vai para segundo plano -- o proprio SDK nao tem como saber que
 * isso aconteceu. Sem o que esta aqui, o inspetor que fecha o app a noite e
 * reabre em campo no dia seguinte pode encontrar a sessao ja vencida, e nao ha
 * ninguem por perto para redigitar a senha. E o mesmo cenario que a
 * fragmentacao no SecureStore (`armazenamento-seguro.ts`) foi construida para
 * evitar, e que este detalhe desfazia.
 *
 * O SEGUNDO PAPEL: revalidar `ativo`/`cargo` ao voltar. O painel web reconsulta
 * `profiles` a cada requisicao no `proxy.ts`; o app nao tinha equivalente --
 * `SessaoProvider` lia o perfil uma vez, na montagem. Desativar um inspetor no
 * painel nao derrubava o app dele ate o processo ser reiniciado. O dado em si
 * nunca esteve exposto (`e_inspetor()` e `usuario_ativo() and
 * nivel_acesso_atual() = 'INSPETOR'`, e toda policy de escrita passa por ela),
 * mas a tela seguia navegavel gravando nada -- falha silenciosa, o pior
 * formato para quem esta em campo.
 *
 * A REGRA de quando agir mora em `ciclo-de-vida.ts`, como funcao pura e com
 * teste proprio. Aqui fica so o efeito: assinar o AppState, guardar as refs
 * que a regra le e chamar o supabase-js.
 */

type Parametros = {
  /**
   * Falso enquanto nao ha sessao. Sem usuario nao ha perfil para revalidar, e
   * um ticker de refresh rodando na tela de login e timer a toa.
   */
  temSessao: boolean;
  /**
   * Rele `profiles` e devolve `true` quando conseguiu ler. O booleano importa:
   * ver `ultimaRevalidacaoEm` abaixo.
   */
  revalidarPerfil: () => Promise<boolean>;
};

export function useCicloDeVidaDaSessao({ temSessao, revalidarPerfil }: Parametros): void {
  /**
   * A callback vai numa ref, nao nas deps do efeito -- mesmo padrao de
   * `useClickOutside` no painel. Sem isso o listener seria removido e
   * reinscrito a cada render do provider, e uma troca de listener no meio de
   * uma transicao de estado do app perde o evento.
   */
  const revalidarRef = useRef(revalidarPerfil);
  useEffect(() => {
    revalidarRef.current = revalidarPerfil;
  });

  /** Guarda contra duas revalidacoes em voo ao mesmo tempo. */
  const revalidacaoEmVoo = useRef(false);

  /**
   * Instante da ultima revalidacao BEM-SUCEDIDA.
   *
   * Marcar so no sucesso e deliberado: uma leitura que falhou por falta de
   * sinal -- o caso comum deste app -- nao deve consumir a janela e fazer o
   * inspetor esperar mais 30 s pela proxima tentativa. Falhou, a proxima ida
   * ao primeiro plano tenta de novo na hora.
   */
  const ultimaRevalidacaoEm = useRef<number | null>(null);

  const revalidar = useCallback(async () => {
    revalidacaoEmVoo.current = true;
    try {
      if (await revalidarRef.current()) {
        // Marcado no fim, e nao no comeco: numa rede lenta a janela deve
        // contar a partir de quando o dado chegou, nao de quando foi pedido.
        ultimaRevalidacaoEm.current = Date.now();
      }
    } finally {
      revalidacaoEmVoo.current = false;
    }
  }, []);

  useEffect(() => {
    if (!temSessao) return;

    /**
     * `AppState.currentState` pode vir `'unknown'` no Android durante a
     * inicializacao. `decidirAcao` trata qualquer coisa que nao seja `active`
     * como "esteve fora", que e o conservador: leva a uma revalidacao a mais,
     * nunca a uma a menos.
     */
    let estadoAnterior: AppStateStatus = AppState.currentState;

    const aplicar = (proximo: AppStateStatus) => {
      const acao = decidirAcao({
        anterior: estadoAnterior,
        proximo,
        revalidacaoEmVoo: revalidacaoEmVoo.current,
        ultimaRevalidacaoEm: ultimaRevalidacaoEm.current,
        agora: Date.now(),
      });

      estadoAnterior = proximo;

      /**
       * `void`: `startAutoRefresh`/`stopAutoRefresh` sao async no supabase-js e
       * ninguem espera por elas -- o tick roda em segundo plano e o resultado
       * chega por `onAuthStateChange`. O operador marca o descarte como
       * deliberado (`no-floating-promises`).
       *
       * `startAutoRefresh` roda um tick imediatamente e so vai a rede se o
       * token estiver perto de vencer. E por isso que NAO ha um
       * `refreshSession()` explicito aqui: ele trocaria o par de tokens em
       * toda abertura do app, inclusive nas que acabaram de acontecer --
       * round-trip garantido onde o SDK ja sabe decidir se precisa.
       */
      if (acao.autoRefresh === true) void supabase.auth.startAutoRefresh();
      else if (acao.autoRefresh === false) void supabase.auth.stopAutoRefresh();

      /**
       * A revalidacao do perfil tambem valida a sessao, de graca: a consulta a
       * `profiles` viaja com o token atual e passa pelo RLS. Token invalido
       * derruba a leitura, `erroDePerfil` e preenchido e a `Navegacao` cai em
       * TelaDeAcessoBloqueado. Nao ha necessidade de um `getUser()` a parte so
       * para conferir a sessao.
       */
      if (acao.revalidarPerfil) void revalidar();
    };

    /**
     * O app quase sempre nasce em primeiro plano, e o listener so dispara na
     * MUDANCA seguinte. Sem esta chamada, o refresh automatico so comecaria a
     * valer depois da primeira ida e volta ao segundo plano. Nao revalida o
     * perfil: `anterior === proximo === "active"`, e o proprio
     * `SessaoProvider` ja carrega o perfil na montagem.
     */
    aplicar(AppState.currentState);

    const assinatura = AppState.addEventListener("change", aplicar);

    return () => {
      assinatura.remove();
      // Sair da conta (ou desmontar o provider) nao deve deixar um ticker de
      // refresh vivo tentando renovar uma sessao que nao existe mais.
      void supabase.auth.stopAutoRefresh();
    };
  }, [temSessao, revalidar]);
}
