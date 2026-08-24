import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Tables } from "@projeto-renatoo/shared";

import { supabase } from "../lib/supabase";

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
  recarregarPerfil: () => Promise<void>;
  sair: () => Promise<void>;
};

const ContextoDeSessao = createContext<EstadoDaSessao | null>(null);

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
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setSessao(data.session);
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

    lerPerfil(idDoUsuario).then((resultado) => {
      if (!ativo) return;
      setPerfilCarregado({ id: idDoUsuario, perfil: resultado.perfil, erro: resultado.erro });
    });

    return () => {
      ativo = false;
    };
  }, [idDoUsuario]);

  const recarregarPerfil = useCallback(async () => {
    if (!idDoUsuario) return;

    const resultado = await lerPerfil(idDoUsuario);
    setPerfilCarregado({ id: idDoUsuario, perfil: resultado.perfil, erro: resultado.erro });
  }, [idDoUsuario]);

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
    return { perfil: null, erro: "Não foi possível carregar seu perfil. Verifique a conexão." };
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
