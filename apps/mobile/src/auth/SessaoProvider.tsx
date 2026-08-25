import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Tables } from "@projeto-renatoo/shared";

import { supabase } from "../lib/supabase";
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

  useEffect(() => {
    if (!idDoUsuario) return;

    // `ativo` protege contra a resposta que chega tarde: se o inspetor sair
    // da conta enquanto a consulta esta no ar, sem esta guarda o perfil
    // antigo voltaria ao estado depois do logout.
    let ativo = true;

    lerPerfil(idDoUsuario)
      .then((resultado) => {
        if (!ativo) return;
        setPerfilCarregado({ id: idDoUsuario, perfil: resultado.perfil, erro: resultado.erro });
      })
      .catch(() => {
        // `lerPerfil` traduz erro do PostgREST, mas nao cobre rejeicao da
        // camada de rede. Sem este ramo o provider ficaria com `perfil` e
        // `erroDePerfil` nulos e a `Navegacao` giraria o spinner sem saida.
        if (!ativo) return;
        setPerfilCarregado({ id: idDoUsuario, perfil: null, erro: FALHA_AO_LER_PERFIL });
      });

    return () => {
      ativo = false;
    };
  }, [idDoUsuario]);

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

    const resultado = await lerPerfil(idDoUsuario);
    if (!montado.current) return false;

    setPerfilCarregado({ id: idDoUsuario, perfil: resultado.perfil, erro: resultado.erro });
    return resultado.erro === null;
  }, [idDoUsuario]);

  /**
   * Refresh de token amarrado ao AppState e revalidacao de `ativo`/`cargo` ao
   * voltar do segundo plano. O raciocinio inteiro esta no cabecalho do hook.
   */
  useCicloDeVidaDaSessao({
    temSessao: idDoUsuario !== null,
    revalidarPerfil: recarregarPerfil,
  });

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
    setPerfilCarregado(null);
  }, []);

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
    }),
    [sessao, doUsuarioAtual, carregando, recarregarPerfil, sair],
  );

  return <ContextoDeSessao.Provider value={valor}>{children}</ContextoDeSessao.Provider>;
}

/**
 * Fora do componente e sem `setState`: devolve o que leu e deixa quem chamou
 * decidir o que fazer com o resultado. E o que permite o effect acima gravar
 * estado so depois do await, sem render em cascata.
 */
async function lerPerfil(
  id: string,
): Promise<{ perfil: PerfilDoInspetor | null; erro: string | null }> {
  // O filtro por id nao substitui a policy "Leitura do proprio perfil ou de
  // gestao" -- ela ja limita o retorno --, mas deixa a consulta ir direto na
  // chave primaria.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, nome_completo, cargo, ativo")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { perfil: null, erro: FALHA_AO_LER_PERFIL };
  }

  return { perfil: data, erro: null };
}

export function useSessao(): EstadoDaSessao {
  const contexto = useContext(ContextoDeSessao);

  if (!contexto) {
    throw new Error("useSessao precisa estar dentro de <SessaoProvider>.");
  }

  return contexto;
}
