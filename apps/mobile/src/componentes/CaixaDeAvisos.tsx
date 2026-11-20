import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";

import { supabase } from "../lib/supabase";
import { cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * Os avisos da pessoa (0103) no topo da tela inicial: a revisao do veiculo, a
 * meta de visitas da semana. Os mesmos do sino do portal -- a tabela e uma so,
 * e o RLS entrega a cada um so os proprios.
 *
 * So as nao lidas aparecem; "Ok" marca como lida e tira da lista. Sem sinal,
 * a caixa simplesmente nao aparece (nada a mostrar nao e erro). A
 * notificacao com o celular fechado (push) depende do modulo nativo de
 * notificacoes, que ainda nao esta no app.
 */

type Notificacao = { id: number; titulo: string; texto: string };

const MAXIMO = 5;

/** `recarga` muda quando a pessoa puxa a tela inicial para atualizar. */
export function CaixaDeAvisos({ recarga = 0 }: { recarga?: number }) {
  const focada = useIsFocused();
  const [avisos, setAvisos] = useState<Notificacao[]>([]);

  useEffect(() => {
    if (!focada) return;
    let ativo = true;
    void supabase
      .from("notificacoes")
      .select("id, titulo, texto")
      .is("lida_em", null)
      .order("criada_em", { ascending: false })
      .limit(MAXIMO)
      .then(({ data, error }) => {
        if (ativo && !error && data) setAvisos(data);
      });
    return () => {
      ativo = false;
    };
  }, [focada, recarga]);

  const dispensar = useCallback((id: number) => {
    setAvisos((atuais) => atuais.filter((a) => a.id !== id));
    void supabase.from("notificacoes").update({ lida_em: new Date().toISOString() }).eq("id", id);
  }, []);

  if (avisos.length === 0) return null;

  return (
    <View style={estilos.raiz} accessibilityLabel="Avisos">
      <Text style={estilos.rotulo}>Avisos</Text>
      {avisos.map((a) => (
        <View key={a.id} style={estilos.aviso}>
          <View style={estilos.miolo}>
            <Text style={estilos.titulo}>{a.titulo}</Text>
            {a.texto ? <Text style={estilos.texto}>{a.texto}</Text> : null}
          </View>
          <Pressable
            onPress={() => dispensar(a.id)}
            accessibilityRole="button"
            accessibilityLabel={`Marcar "${a.titulo}" como lido`}
            hitSlop={8}
            style={({ pressed }) => [estilos.ok, pressed && estilos.okPressionado]}
          >
            <Text style={estilos.okTexto}>Ok</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { gap: espaco.minimo },
  rotulo: texto(tipografia.rotulo, { cor: cores.textoFraco, caixaAlta: true }),
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.entreItens,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.primaria,
    borderRadius: raio.cartao,
    padding: espaco.interno,
  },
  miolo: { flex: 1, gap: 2 },
  titulo: texto(tipografia.corpo, { cor: cores.texto }),
  texto: texto(tipografia.apoio, { cor: cores.textoFraco }),
  ok: { paddingHorizontal: espaco.entreItens, paddingVertical: espaco.minimo, borderRadius: raio.cartao },
  okPressionado: { opacity: 0.6 },
  okTexto: texto(tipografia.rotulo, { cor: cores.primaria }),
});
