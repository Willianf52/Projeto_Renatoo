import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PerfilDoInspetor } from "../auth/SessaoProvider";
import { cores, espaco } from "../tema";

type Motivo = "inativo" | "cargo" | "sem-perfil";

/**
 * Sessao valida que ainda assim nao pode inspecionar.
 *
 * Isto e cortesia de interface, nao seguranca: quem decide e o RLS, via
 * `e_inspetor()` (0036). Mesmo que esta tela fosse burlada, a policy recusaria
 * a gravacao. O que ela evita e o inspetor descobrir que a conta esta inativa
 * so depois de preencher uma visita inteira em campo.
 */
export function TelaDeAcessoBloqueado({
  motivo,
  perfil,
  aoSair,
}: {
  motivo: Motivo;
  perfil: PerfilDoInspetor | null;
  aoSair: () => void;
}) {
  const { titulo, texto } = mensagem(motivo, perfil);

  return (
    <View style={estilos.raiz}>
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>{titulo}</Text>
        <Text style={estilos.texto}>{texto}</Text>

        {perfil ? <Text style={estilos.conta}>Conectado como {perfil.email}</Text> : null}

        <Pressable
          onPress={aoSair}
          accessibilityRole="button"
          style={({ pressed }) => [estilos.botao, pressed && estilos.botaoPressionado]}
        >
          <Text style={estilos.botaoTexto}>Sair</Text>
        </Pressable>
      </View>
    </View>
  );
}

function mensagem(motivo: Motivo, perfil: PerfilDoInspetor | null) {
  if (motivo === "inativo") {
    return {
      titulo: "Conta inativa",
      // Conta nova nasce inativa por padrao (migration 0019, coberta pelo
      // pgTAP `conta_nova_nasce_inativa_test.sql`) -- alguem da gestao precisa
      // ativar no painel.
      texto: "Sua conta ainda não foi ativada. Peça a liberação à supervisão.",
    };
  }

  if (motivo === "cargo") {
    return {
      titulo: "Acesso não liberado",
      texto: `Este aplicativo é do time de inspeção em campo. Seu cargo é ${
        perfil?.cargo ?? "desconhecido"
      }, que usa o painel web.`,
    };
  }

  return {
    titulo: "Perfil não encontrado",
    texto: "Não foi possível carregar seu perfil. Verifique a conexão e entre novamente.",
  };
}

const estilos = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: cores.fundo,
    alignItems: "center",
    justifyContent: "center",
    padding: espaco.g,
  },
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.g,
    width: "100%",
  },
  titulo: { fontSize: 20, fontWeight: "700", color: cores.texto },
  texto: { fontSize: 15, color: cores.textoFraco, marginTop: espaco.m, lineHeight: 22 },
  conta: { fontSize: 13, color: cores.textoFraco, marginTop: espaco.m },
  botao: {
    marginTop: espaco.g,
    backgroundColor: cores.primaria,
    borderRadius: 10,
    paddingVertical: espaco.m,
    alignItems: "center",
  },
  botaoPressionado: { opacity: 0.85 },
  botaoTexto: { color: cores.textoInverso, fontSize: 16, fontWeight: "700" },
});
