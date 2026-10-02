import { useEffect, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LIMITE_EMAIL } from "@projeto-renatoo/shared";

import { pedirNovaSenha } from "../auth/recuperar-senha";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { Marca } from "../componentes/Marca";
import { env } from "../lib/env";
import { cores, espaco, texto, tipografia } from "../tema";

/** Mesma largura util do login. */
const LARGURA_DO_FORMULARIO = 320;

/**
 * "Esqueceu a senha?" do app -- traducao de `apps/web/src/app/recuperar-senha`:
 * o mesmo texto, a mesma confirmacao unica com ou sem conta. A regra mora em
 * `auth/recuperar-senha.ts`.
 *
 * Fora da pilha de navegacao, como o login (ver `Navegacao`): quem esta aqui
 * nao tem sessao. O voltar do Android e o link "Voltar para o login" fazem o
 * mesmo caminho.
 */
export function TelaDeRecuperarSenha({
  emailInicial,
  aoVoltar,
}: {
  emailInicial: string;
  aoVoltar: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState(emailInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      aoVoltar();
      return true;
    });
    return () => assinatura.remove();
  }, [aoVoltar]);

  async function enviar() {
    if (enviando) return;
    setEnviando(true);
    setErro(null);

    const resultado = await pedirNovaSenha(email, env.urlDoPortal);

    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setEnviado(true);
  }

  return (
    <KeyboardAvoidingView style={estilos.raiz} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[
          estilos.conteudo,
          { paddingTop: insets.top + espaco.secao, paddingBottom: insets.bottom + espaco.secao },
        ]}
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical={false}
      >
        <View style={estilos.formulario}>
          <View style={estilos.marca}>
            <Marca altura={32} />
          </View>

          <Text style={estilos.titulo}>Recuperar senha</Text>

          {enviado ? (
            <Aviso
              tom="sucesso"
              estilo={estilos.bloco}
              mensagem="Se o e-mail informado estiver cadastrado, você receberá em breve as instruções para criar uma nova senha. Confira também a caixa de spam."
            />
          ) : (
            <>
              <Text style={estilos.explicacao}>
                Por favor entre com seu e-mail no campo abaixo para receber uma nova senha.
              </Text>

              <View style={estilos.bloco}>
                <Campo
                  rotulo="Seu e-mail"
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
                  maxLength={LIMITE_EMAIL}
                  placeholder="Digite seu e-mail"
                  editable={!enviando}
                  returnKeyType="send"
                  onSubmitEditing={() => {
                    void enviar();
                  }}
                />
              </View>

              {erro ? <Aviso mensagem={erro} estilo={estilos.bloco} /> : null}

              <View style={estilos.bloco}>
                <Botao
                  titulo={enviando ? "Enviando..." : "Enviar"}
                  aoPressionar={() => {
                    void enviar();
                  }}
                  carregando={enviando}
                  desabilitado={enviando || email.trim().length === 0}
                  larguraTotal
                />
              </View>
            </>
          )}

          <Pressable
            onPress={aoVoltar}
            accessibilityRole="link"
            hitSlop={8}
            style={({ pressed }) => [estilos.voltar, pressed && estilos.pressionado]}
          >
            <Text style={estilos.voltarTexto}>Voltar para o login</Text>
          </Pressable>
        </View>
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
  titulo: texto(tipografia.titulo, { cor: cores.texto }),
  explicacao: { ...texto(tipografia.nota, { cor: cores.textoFraco }), marginTop: espaco.minimo },
  bloco: { marginTop: espaco.confortavel },
  voltar: { marginTop: espaco.entreCampos, alignSelf: "center" },
  pressionado: { opacity: 0.6 },
  voltarTexto: texto(tipografia.nota, { cor: cores.primaria }),
});
