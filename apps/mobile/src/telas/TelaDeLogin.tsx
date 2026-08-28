import { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LIMITE_EMAIL, movimento } from "@projeto-renatoo/shared";

import {
  LIMITE_ZERADO,
  registrarFalha,
  segundosRestantes,
  type EstadoDoLimite,
} from "../auth/limite-de-tentativas";
import { guardarLimite, lerLimiteGuardado } from "../auth/limite-guardado";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { useAbalo, useEntrada } from "../componentes/entrada";
import { IconeDeCadeado } from "../componentes/icones";
import { Marca } from "../componentes/Marca";
import { env } from "../lib/env";
import { supabase } from "../lib/supabase";
import { cores, espaco, texto, tipografia } from "../tema";

/** Mesma largura util do formulario do painel (`max-w-xs`). */
const LARGURA_DO_FORMULARIO = 320;

/**
 * O `signInWithPassword` guarda a sessao pelo storage injetado no cliente
 * (Keychain/Keystore), entao nao ha nada a persistir aqui: o SessaoProvider recebe
 * o evento e a arvore troca de tela sozinha.
 *
 * Visualmente esta tela e a traducao do painel lateral de login da web
 * (`apps/web/src/app/page.tsx`): a tela inteira e a superficie elevada
 * (`brand-surface`), e os campos sao o navy do fundo. O que na web e uma
 * coluna de 25% ao lado do hero, aqui e o aparelho inteiro -- o hero nao cabe
 * num celular em pe, e forcar uma versao dele em cima dos campos empurraria o
 * formulario para debaixo do teclado.
 */
export function TelaDeLogin() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoDeSenha = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const [limite, setLimite] = useState<EstadoDoLimite>(LIMITE_ZERADO);
  const [segundos, setSegundos] = useState(0);
  const abalo = useAbalo();

  // A mesma cascata do painel: marca, e-mail, senha, link, botao.
  const entradaDaMarca = useEntrada();
  const entradaDoEmail = useEntrada(movimento.atraso.primeiro);
  const entradaDaSenha = useEntrada(movimento.atraso.segundo);
  const entradaDoLink = useEntrada(movimento.atraso.terceiro);
  const entradaDoBotao = useEntrada(movimento.atraso.quarto);

  /**
   * Derivado da contagem regressiva, e nao de `Date.now()` no corpo do
   * componente -- mesma nota do painel: funcao impura na renderizacao produz
   * resultado instavel entre renders.
   */
  const bloqueado = segundos > 0;
  const podeEnviar = email.trim().length > 0 && senha.length > 0 && !enviando && !bloqueado;

  // O bloqueio tem prioridade sobre a mensagem de credencial: e ele que
  // responde "por que o botao nao funciona", que e a duvida de quem esta
  // olhando para a tela naquele momento.
  const aviso = bloqueado
    ? `Muitas tentativas. Aguarde ${segundos}s para tentar de novo.`
    : erro;

  /**
   * Recupera o bloqueio que sobreviveu a um fechamento do app.
   *
   * Efeito, e nao inicializador preguicoso como no painel: o Keystore so
   * responde de forma assincrona, entao nao ha como ler antes do primeiro
   * render. A janela em que o botao aparece liberado dura o tempo de uma
   * leitura -- e ainda seria preciso digitar e-mail e senha dentro dela para
   * que isso significasse alguma coisa.
   */
  useEffect(() => {
    let ativo = true;

    void lerLimiteGuardado(Date.now()).then((guardado) => {
      if (!ativo) return;
      setLimite(guardado);
      setSegundos(segundosRestantes(guardado, Date.now()));
    });

    return () => {
      ativo = false;
    };
  }, []);

  // Um tique por segundo enquanto durar o bloqueio, e nada fora dele.
  useEffect(() => {
    if (limite.bloqueadoAte === null) return;

    const atualizar = () => setSegundos(segundosRestantes(limite, Date.now()));

    atualizar();
    const intervalo = setInterval(atualizar, 1000);

    return () => clearInterval(intervalo);
  }, [limite]);

  async function entrar() {
    if (!podeEnviar) return;

    setEnviando(true);
    setErro(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    });

    if (error) {
      // Mensagem generica de proposito: distinguir "e-mail nao existe" de
      // "senha errada" transforma a tela de login num verificador de quem tem
      // conta. O log do Supabase guarda o motivo real para suporte.
      setErro("E-mail ou senha inválidos.");
      setEnviando(false);
      abalo.sacudir();

      const proximo = registrarFalha(limite, Date.now());
      setLimite(proximo);
      setSegundos(segundosRestantes(proximo, Date.now()));
      void guardarLimite(proximo);
      return;
    }

    // Acertou: a contagem nao pode sobrar para a proxima sessao. Sem esperar
    // a gravacao -- a troca de tela nao deve ficar presa a uma escrita no
    // Keystore, e nada le este valor antes da proxima abertura do login.
    void guardarLimite(LIMITE_ZERADO);

    // Sem setEnviando(false) no sucesso: a troca de tela desmonta este
    // componente, e atualizar estado depois disso avisa em console a toa.
  }

  return (
    <KeyboardAvoidingView
      style={estilos.raiz}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          estilos.conteudo,
          // A tela nao usa SafeAreaView porque o fundo deve sangrar ate a
          // borda; o recuo vai so no conteudo, para a marca nao encostar no
          // recorte da camera nem o botao na barra de gestos.
          { paddingTop: insets.top + espaco.secao, paddingBottom: insets.bottom + espaco.secao },
        ]}
        keyboardShouldPersistTaps="handled"
        // Sem isto, um formulario que cabe na tela ainda "sacode" ao rolar,
        // o que num app de campo passa por travamento.
        alwaysBounceVertical={false}
      >
        <Animated.View style={[estilos.formulario, abalo.estilo]}>
          <Animated.View style={[estilos.marca, entradaDaMarca]}>
            {/* Os mesmos 32 pontos do `BrandLogo size="sm"` da web, que e o
                tamanho usado justamente nesse painel de login. */}
            <Marca altura={32} />
          </Animated.View>

          <Animated.View style={entradaDoEmail}>
            <Campo
              rotulo="E-mail"
              valor={email}
              aoMudar={(valor) => {
                setEmail(valor);
                if (erro) setErro(null);
              }}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              // LIMITE_EMAIL vem do shared (RFC 5321), o mesmo teto que a rota
              // de importacao do painel web aplica.
              maxLength={LIMITE_EMAIL}
              placeholder="inspetor@upservicos.com.br"
              editable={!enviando}
              returnKeyType="next"
              onSubmitEditing={() => campoDeSenha.current?.focus()}
            />
          </Animated.View>

          <Animated.View style={[estilos.campoSeguinte, entradaDaSenha]}>
            <Campo
              ref={campoDeSenha}
              rotulo="Senha"
              valor={senha}
              aoMudar={(valor) => {
                setSenha(valor);
                if (erro) setErro(null);
              }}
              senha
              autoCapitalize="none"
              autoComplete="current-password"
              placeholder="••••••••"
              editable={!enviando}
              returnKeyType="go"
              onSubmitEditing={entrar}
            />
          </Animated.View>

          {aviso ? <Aviso mensagem={aviso} estilo={estilos.banner} /> : null}

          {env.urlDoPortal ? (
            <Animated.View style={[estilos.linha, entradaDoLink]}>
              <Pressable
                onPress={() => {
                  void Linking.openURL(`${env.urlDoPortal}/recuperar-senha`);
                }}
                accessibilityRole="link"
                hitSlop={8}
                style={({ pressed }) => [estilos.link, pressed && estilos.linkPressionado]}
              >
                <IconeDeCadeado cor={cores.textoFraco} />
                <Text style={estilos.linkTexto}>Perdeu sua Senha?</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          <Animated.View style={[estilos.acao, entradaDoBotao]}>
            <Botao
              titulo={bloqueado ? `Aguarde ${segundos}s` : enviando ? "Entrando..." : "Entrar"}
              aoPressionar={entrar}
              carregando={enviando}
              desabilitado={!podeEnviar}
              larguraTotal
            />
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.superficie },
  conteudo: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: espaco.confortavel,
  },
  formulario: { width: "100%", maxWidth: LARGURA_DO_FORMULARIO },
  marca: { alignItems: "center", marginBottom: espaco.secao },
  campoSeguinte: { marginTop: espaco.entreCampos },
  banner: { marginTop: espaco.entreCampos },
  linha: { marginTop: espaco.entreCampos, alignItems: "flex-end" },
  link: { flexDirection: "row", alignItems: "center", gap: espaco.rotulo },
  linkPressionado: { opacity: 0.6 },
  linkTexto: texto(tipografia.nota, { cor: cores.textoFraco }),
  acao: { marginTop: espaco.entreCampos },
});
