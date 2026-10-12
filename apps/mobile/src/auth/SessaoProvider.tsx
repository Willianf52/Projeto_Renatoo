import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Tables } from "@projeto-renatoo/shared";

import { esquecerInspetor, identificarInspetor } from "../lib/observabilidade";
import { comPrazo, ESGOTADO, PRAZO_ANTES_DA_COPIA_MS } from "../lib/com-prazo";
import { supabase } from "../lib/supabase";
import { esquecerPerfil, guardarPerfil, lerPerfilGuardado } from "./perfil-guardado";
import { AVISO_DE_SESSAO_EXPIRADA, deveEncerrarPorPrazo } from "./prazo-da-sessao";
import { useCicloDeVidaDaSessao } from "./useCicloDeVidaDaSessao";

/**
 * So os campos que o app usa. `Tables<"profiles">` vem do schema real
 * (`database.types.ts`, regenerado do banco e verificado pelo job `banco` da
 * CI), entao renomear ou remover uma destas colunas quebra o build aqui em
 * vez de virar `undefined` na tela de um inspetor sem sinal.
 */
export type PerfilDoInspetor = Pick<
  Tables<"profiles">,
  "id" | "email" | "nome_completo" | "cargo" | "ativo"
>;

type EstadoDaSessao = {
  sessao: Session | null;
  perfil: PerfilDoInspetor | null;
  /** Verdadeiro ate a sessao persistida ser lida do disco na abertura do app. */
  carregando: boolean;
  /** Falha ao carregar o perfil (rede, RLS). Sessao valida sem perfil legivel. */
  erroDePerfil: string | null;
  /** Rele `profiles`. Devolve `true` quando a leitura chegou -- ver o uso em
   * `useCicloDeVidaDaSessao`, que so consome a janela de throttle no sucesso. */
  recarregarPerfil: () => Promise<boolean>;
  sair: () => Promise<void>;
  /** Por que a sessao anterior foi encerrada pelo app (hoje: prazo de 30 dias).
   * A TelaDeLogin mostra; some no proximo login. */
  avisoDeSaida: string | null;
};

const ContextoDeSessao = createContext<EstadoDaSessao | null>(null);

/** Mesma frase para falha do PostgREST e para rejeicao de rede: para quem
 * esta em campo as duas sao "nao deu para carregar, veja o sinal". */
const FALHA_AO_LER_PERFIL = "Não foi possível carregar seu perfil. Verifique a conexão.";

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  /**
   * O perfil carregado, etiquetado com o id de quem ele e.
   *
   * Guardar o perfil solto abriria uma janela em que o inspetor anterior
   * aparece para o proximo: dois inspetores dividindo o mesmo aparelho, o
   * segundo entra, e ate a consulta dele voltar a tela mostra o nome do
   * primeiro. Com a etiqueta, perfil de outro id simplesmente nao e exposto.
   */
  const [perfilCarregado, setPerfilCarregado] = useState<{
    id: string;
    perfil: PerfilDoInspetor | null;
    erro: string | null;
  } | null>(null);

  useEffect(() => {
    let ativo = true;

    // Sessao persistida no Keychain/Keystore: e o que faz o inspetor abrir o app
    // ja logado no dia seguinte, sem digitar senha em campo.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!ativo) return;
        setSessao(data.session);
        setCarregando(false);
      })
      .catch(() => {
        // Ler a sessao persistida pode falhar de verdade -- SecureStore
        // corrompido, manifesto apontando para pedaco que sumiu. Sem este
        // ramo `carregando` nunca sai de `true` e o app fica no spinner para
        // sempre; cair no login e o pior caso aceitavel.
        if (!ativo) return;
        setSessao(null);
        setCarregando(false);
      });

    // O callback do onAuthStateChange NAO pode aguardar outra chamada do
    // supabase-js: o cliente serializa as operacoes de auth, e um `await`
    // aqui dentro trava as proximas. Por isso ele so guarda a sessao -- a
    // busca do perfil acontece no efeito abaixo, disparada pela mudanca de
    // estado, e nao de dentro do callback.
    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
      setCarregando(false);
    });

    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, []);

  const idDoUsuario = sessao?.user.id ?? null;

  /**
   * Amarra os eventos do Sentry a conta -- so o uuid, nunca nome ou e-mail
   * (ver `lib/observabilidade.ts`).
   *
   * Efeito proprio, com limpeza, e nao uma chamada solta no login: o aparelho
   * e compartilhado entre turnos, e sem o `esquecerInspetor` do retorno o erro
   * do inspetor da noite chegaria etiquetado com o uuid do inspetor da manha.
   */
  useEffect(() => {
    if (!idDoUsuario) {
      esquecerInspetor();
      return;
    }

    identificarInspetor(idDoUsuario);

    return () => {
      esquecerInspetor();
    };
  }, [idDoUsuario]);

  /**
   * Prazo de 30 dias desde o ultimo login (`prazo-da-sessao.ts`).
   *
   * Aplicado no MESMO callback que recebe a leitura do perfil -- na abertura e
   * em cada volta ao primeiro plano --, e nao num efeito que reage ao perfil
   * depois: setState dentro de efeito e o render em cascata que o lint do
   * projeto (`set-state-in-effect`) recusa. So encerra com a leitura
   * bem-sucedida, isto e, com sinal.
   *
   * O ultimo login vai por ref para o callback ler sempre a sessao atual sem
   * entrar nas dependencias dos efeitos que o chamam.
   */
  const [avisoDeSaida, setAvisoDeSaida] = useState<string | null>(null);
  const ultimoLoginEm = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    ultimoLoginEm.current = sessao?.user.last_sign_in_at;
  });

  const aplicarPrazoDaSessao = useCallback((perfilLidoComSucesso: boolean) => {
    if (!deveEncerrarPorPrazo({ ultimoLoginEm: ultimoLoginEm.current, perfilLidoComSucesso })) {
      return;
    }
    setAvisoDeSaida(AVISO_DE_SESSAO_EXPIRADA);
    void supabase.auth.signOut().then(() => setPerfilCarregado(null));
  }, []);

  useEffect(() => {
    if (!idDoUsuario) return;

    // `ativo` protege contra a resposta que chega tarde: se o inspetor sair
    // da conta enquanto a consulta esta no ar, sem esta guarda o perfil
    // antigo voltaria ao estado depois do logout.
    let ativo = true;

    // Sem sinal, `lerPerfilComCopia` devolve a copia guardada no aparelho --
    // e o que deixa o inspetor abrir o app num subsolo (ver `perfil-guardado.ts`).
    // O prazo de 30 dias so corre com leitura de verdade, do servidor.
    void lerPerfilComCopia(idDoUsuario).then((resultado) => {
      if (!ativo) return;
      setPerfilCarregado({ id: idDoUsuario, perfil: resultado.perfil, erro: resultado.erro });
      aplicarPrazoDaSessao(resultado.erro === null && !resultado.semRede);
    });

    return () => {
      ativo = false;
    };
  }, [idDoUsuario, aplicarPrazoDaSessao]);

  /**
   * Vivo enquanto o provider estiver montado.
   *
   * `recarregarPerfil` e chamado de fora do ciclo de render (do listener de
   * AppState), entao nao tem o `let ativo` que protege o efeito acima. Sem
   * esta guarda, uma revalidacao em voo no momento do desmonte gravaria
   * estado num componente que ja saiu.
   */
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const recarregarPerfil = useCallback(async (): Promise<boolean> => {
    if (!idDoUsuario) return false;

    /**
     * O `catch` e a mesma defesa que o efeito de montagem acima ja tem, e
     * pela mesma razao: `lerPerfil` traduz erro do PostgREST, nao rejeicao da
     * camada de rede. Sem ele a rejeicao escapava por este caminho, e o
     * chamador (`useCicloDeVidaDaSessao`, que descarta com `void`) a perdia.
     *
     * A consequencia nao era so um log a menos. Esta funcao E o portao que
     * derruba o inspetor desativado no painel -- o equivalente movel da
     * releitura de `profiles` no `proxy.ts` da web. Falhando calada, ela
     * falhava ABERTA: `erroDePerfil` seguia nulo, a `Navegacao` nao caia em
     * `TelaDeAcessoBloqueado` e o app continuava navegavel.
     *
     * Desde 12/10/2026 a regra distingue as duas falhas: resposta do servidor
     * (perfil sumiu, conta inativa) fecha o portao como antes; falta de REDE
     * mantem o perfil que o app ja tinha -- senao o inspetor em campo, sem
     * sinal, era trancado fora do proprio trabalho. O envio continua barrado
     * no banco para conta desativada (RLS), entao isso nao libera escrita.
     */
    const resultado = await lerPerfilComCopia(idDoUsuario);

    if (!montado.current) return false;

    if (resultado.semRede) {
      // FALTA DE SINAL NAO FECHA O PORTAO (12/10/2026). O inspetor que volta
      // da camera num subsolo continua com o perfil que ja tinha; so cai no
      // bloqueio quem nao tem perfil nenhum -- nem em memoria, nem guardado.
      // O que derruba a conta desativada e a RESPOSTA do servidor, abaixo, e
      // o RLS no envio; um erro de rede nao diz nada sobre a conta.
      setPerfilCarregado((atual) =>
        atual !== null && atual.id === idDoUsuario && atual.perfil !== null
          ? atual
          : { id: idDoUsuario, perfil: resultado.perfil, erro: resultado.erro },
      );
      // Sem consumir a janela de throttle: com sinal de volta, revalida.
      return false;
    }

    setPerfilCarregado({ id: idDoUsuario, perfil: resultado.perfil, erro: resultado.erro });
    aplicarPrazoDaSessao(resultado.erro === null);
    return resultado.erro === null;
  }, [idDoUsuario, aplicarPrazoDaSessao]);

  /**
   * Refresh de token amarrado ao AppState e revalidacao de `ativo`/`cargo` ao
   * voltar do segundo plano. O raciocinio inteiro esta no cabecalho do hook.
   */
  useCicloDeVidaDaSessao({
    temSessao: idDoUsuario !== null,
    revalidarPerfil: recarregarPerfil,
  });

  const sair = useCallback(async () => {
    // A copia do perfil sai junto: o aparelho passa para o proximo turno.
    if (idDoUsuario) await esquecerPerfil(idDoUsuario).catch(() => undefined);
    await supabase.auth.signOut();
    setPerfilCarregado(null);
  }, [idDoUsuario]);

  // Derivado, nao guardado: perfil de outro id (ou sem sessao) nao aparece.
  // Zerar isso por effect faria o componente renderizar uma vez com os dois
  // em desacordo -- sessao ja trocada e perfil ainda do usuario anterior.
  const doUsuarioAtual =
    perfilCarregado && perfilCarregado.id === idDoUsuario ? perfilCarregado : null;

  const valor = useMemo<EstadoDaSessao>(
    () => ({
      sessao,
      perfil: doUsuarioAtual?.perfil ?? null,
      carregando,
      erroDePerfil: doUsuarioAtual?.erro ?? null,
      recarregarPerfil,
      sair,
      // Novo login limpa o aviso: com sessao ativa ele nao aparece.
      avisoDeSaida: idDoUsuario ? null : avisoDeSaida,
    }),
    [sessao, doUsuarioAtual, carregando, recarregarPerfil, sair, idDoUsuario, avisoDeSaida],
  );

  return <ContextoDeSessao.Provider value={valor}>{children}</ContextoDeSessao.Provider>;
}

/**
 * Fora do componente e sem `setState`: devolve o que leu e deixa quem chamou
 * decidir o que fazer com o resultado. E o que permite o effect acima gravar
 * estado so depois do await, sem render em cascata.
 */
type LeituraDoPerfil = {
  perfil: PerfilDoInspetor | null;
  erro: string | null;
  /** A leitura nao chegou ao servidor (`status` 0 do PostgREST, ou rejeicao). */
  semRede: boolean;
};

async function lerPerfil(id: string): Promise<LeituraDoPerfil> {
  // O filtro por id nao substitui a policy "Leitura do proprio perfil ou de
  // gestao" -- ela ja limita o retorno --, mas deixa a consulta ir direto na
  // chave primaria.
  const { data, error, status } = await supabase
    .from("profiles")
    .select("id, email, nome_completo, cargo, ativo")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    // `status` 0: o fetch nem completou (sem sinal, DNS, timeout) -- e assim
    // que o postgrest-js devolve falha de rede quando nao lanca. Qualquer outro
    // status e o servidor respondendo, e isso vale como resposta.
    return { perfil: null, erro: FALHA_AO_LER_PERFIL, semRede: status === 0 };
  }

  return { perfil: data, erro: null, semRede: false };
}

/**
 * `lerPerfil` com a copia do aparelho por tras. Leitura boa do servidor
 * atualiza a copia; falta de rede usa a copia, se houver. Nunca rejeita.
 */
async function lerPerfilComCopia(id: string): Promise<LeituraDoPerfil> {
  const leitura = lerPerfil(id)
    // Rejeicao da camada de rede: mesma leitura que o `status` 0.
    .catch((): LeituraDoPerfil => ({ perfil: null, erro: FALHA_AO_LER_PERFIL, semRede: true }))
    .then(async (resultado) => {
      // Leitura boa do servidor renova a copia, chegue ela quando chegar.
      if (resultado.perfil) await guardarPerfil(resultado.perfil).catch(() => undefined);
      return resultado;
    });

  // Sem sinal o postgrest-js tenta de novo por ~7 s; com copia no aparelho
  // nao vale a pena esperar tudo isso na abertura (`com-prazo.ts`).
  const primeira = await comPrazo(leitura, PRAZO_ANTES_DA_COPIA_MS);
  if (primeira !== ESGOTADO && !primeira.semRede) return primeira;

  const copia = await lerPerfilGuardado(id).catch(() => null);
  if (copia) return { perfil: copia, erro: null, semRede: true };
  return primeira === ESGOTADO ? leitura : primeira;
}

export function useSessao(): EstadoDaSessao {
  const contexto = useContext(ContextoDeSessao);

  if (!contexto) {
    throw new Error("useSessao precisa estar dentro de <SessaoProvider>.");
  }

  return contexto;
}
