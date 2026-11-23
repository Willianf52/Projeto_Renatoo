import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { metasPendentes, type MetaPendente } from "@projeto-renatoo/shared";

import { supabase } from "../lib/supabase";
import { cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * "Lista de clientes pendentes com 1/4 (sem)" (pedido do gestor, 16/11/2026):
 * os lugares em que a pessoa ainda nao bateu a meta do periodo atual (0105 a
 * 0107), na tela inicial. Some quando nao ha meta pendente.
 *
 * O progresso vem do banco (`progresso_das_metas`, security invoker), que
 * conta qualquer checklist enviado. Sem sinal, a lista nao aparece: um numero
 * velho faria o inspetor achar que falta visita que ja fez.
 */

type Linha = MetaPendente & { siteNome: string };

/** `recarga` muda quando a pessoa puxa a tela inicial para atualizar. */
export function MetasPendentes({ usuarioId, recarga = 0 }: { usuarioId: string | null; recarga?: number }) {
  const focada = useIsFocused();
  const [linhas, setLinhas] = useState<Linha[]>([]);

  useEffect(() => {
    if (!focada || !usuarioId) return;
    let ativo = true;

    (async () => {
      const { data, error } = await supabase.rpc("progresso_das_metas");
      if (error || !data) return;
      const pendentes = metasPendentes(data, usuarioId);
      if (pendentes.length === 0) {
        if (ativo) setLinhas([]);
        return;
      }
      const { data: sites } = await supabase
        .from("sites")
        .select("id, nome")
        .in("id", [...new Set(pendentes.map((p) => p.siteId))]);
      const nome = new Map((sites ?? []).map((s) => [s.id, s.nome]));
      if (ativo) setLinhas(pendentes.map((p) => ({ ...p, siteNome: nome.get(p.siteId) ?? "Lugar" })));
    })().catch(() => undefined);

    return () => {
      ativo = false;
    };
  }, [focada, usuarioId, recarga]);

  if (linhas.length === 0) return null;

  return (
    <View style={estilos.raiz} accessibilityLabel="Metas de visita pendentes">
      <Text style={estilos.rotulo}>Metas de visita</Text>
      <View style={estilos.cartao}>
        {linhas.map((l, i) => (
          <View key={l.metaId} style={[estilos.linha, i > 0 && estilos.divisor]}>
            <Text style={estilos.site} numberOfLines={1}>
              {l.siteNome}
            </Text>
            <Text style={estilos.resumo}>{l.resumo}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { gap: espaco.minimo },
  rotulo: texto(tipografia.rotulo, { cor: cores.textoFraco, caixaAlta: true }),
  cartao: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.cartao,
    paddingHorizontal: espaco.interno,
  },
  linha: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: espaco.entreItens,
    paddingVertical: espaco.entreItens,
  },
  divisor: { borderTopWidth: 1, borderTopColor: cores.borda },
  site: { ...texto(tipografia.corpo, { cor: cores.texto }), flex: 1 },
  resumo: texto(tipografia.apoio, { cor: "#fbbf24" }),
});
