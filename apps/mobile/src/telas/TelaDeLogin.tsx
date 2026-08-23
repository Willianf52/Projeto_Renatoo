import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LIMITE_EMAIL } from "@projeto-renatoo/shared";

import { supabase } from "../lib/supabase";
import { cores, espaco } from "../tema";

/**
 * O `signInWithPassword` guarda a sessao pelo storage injetado no cliente
 * (AsyncStorage), entao nao ha nada a persistir aqui: o SessaoProvider recebe
 * o evento e a arvore troca de tela sozinha.
 */
export function TelaDeLogin() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const podeEnviar = email.trim().length > 0 && senha.length > 0 && !enviando;

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
      return;
    }

    // Sem setEnviando(false) no sucesso: a troca de tela desmonta este
    // componente, e atualizar estado depois disso avisa em console a toa.
  }

  return (
    <KeyboardAvoidingView
      style={estilos.raiz}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={estilos.conteudo}
        keyboardShouldPersistTaps="handled"
      >
        <View style={estilos.cabecalho}>
          <Text style={estilos.titulo}>Up Serviços</Text>
          <Text style={estilos.subtitulo}>Inspeção em campo</Text>
        </View>

        <View style={estilos.campo}>
          <Text style={estilos.rotulo}>E-mail</Text>
          <TextInput
            style={estilos.entrada}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            inputMode="email"
            // LIMITE_EMAIL vem do shared (RFC 5321), o mesmo teto que a rota
            // de importacao do painel web aplica.
            maxLength={LIMITE_EMAIL}
            placeholder="inspetor@upservicos.com.br"
            placeholderTextColor={cores.textoFraco}
            editable={!enviando}
            returnKeyType="next"
          />
        </View>

        <View style={estilos.campo}>
          <Text style={estilos.rotulo}>Senha</Text>
          <TextInput
            style={estilos.entrada}
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            placeholder="••••••••"
            placeholderTextColor={cores.textoFraco}
            editable={!enviando}
            returnKeyType="go"
            onSubmitEditing={entrar}
          />
        </View>

        {erro ? (
          <View style={estilos.erro} accessibilityLiveRegion="polite">
            <Text style={estilos.erroTexto}>{erro}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            estilos.botao,
            !podeEnviar && estilos.botaoInativo,
            pressed && podeEnviar && estilos.botaoPressionado,
          ]}
          onPress={entrar}
          disabled={!podeEnviar}
          accessibilityRole="button"
        >
          {enviando ? (
            <ActivityIndicator color={cores.textoInverso} />
          ) : (
            <Text style={estilos.botaoTexto}>Entrar</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { flexGrow: 1, justifyContent: "center", padding: espaco.g },
  cabecalho: { marginBottom: espaco.gg },
  titulo: { fontSize: 30, fontWeight: "700", color: cores.texto },
  subtitulo: { fontSize: 16, color: cores.textoFraco, marginTop: espaco.p },
  campo: { marginBottom: espaco.m },
  rotulo: { fontSize: 14, fontWeight: "600", color: cores.texto, marginBottom: espaco.p },
  entrada: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    paddingHorizontal: espaco.m,
    paddingVertical: espaco.m,
    fontSize: 16,
    color: cores.texto,
    backgroundColor: cores.superficie,
  },
  erro: {
    backgroundColor: cores.erroFundo,
    borderRadius: 10,
    padding: espaco.m,
    marginBottom: espaco.m,
  },
  erroTexto: { color: cores.erroTexto, fontSize: 14 },
  botao: {
    backgroundColor: cores.primaria,
    borderRadius: 10,
    paddingVertical: espaco.m,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  botaoInativo: { opacity: 0.5 },
  botaoPressionado: { opacity: 0.85 },
  botaoTexto: { color: cores.textoInverso, fontSize: 16, fontWeight: "700" },
});
