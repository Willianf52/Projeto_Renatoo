import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { Aviso } from "../componentes/Aviso";
import { EsqueletoDaLista } from "../componentes/Esqueleto";
import { EstadoVazio } from "../componentes/EstadoVazio";
import { lerRespondidos, type ChecklistRespondido } from "../lib/agendados-e-respondidos";
import { colunaDeLeitura, cores, espaco, raio, texto, tipografia } from "../tema";
import { COR_DO_STATUS } from "./TelaDeAgendados";

/**
 * "Checklists respondidos" de um local, como no app do sistema de referencia:
 * os enviados mais recentes (ate 30), com numero/ano, checklist e quando.
 */
export function TelaDeRespondidos({ siteId }: { siteId: number }) {
  const [lista, setLista] = useState<ChecklistRespondido[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void lerRespondidos(siteId).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setLista(resultado.lista);
      else {
        setLista([]);
        setErro(resultado.erro);
      }
    });
    return () => {
      ativo = false;
    };
  }, [siteId]);

  if (lista === null) {
    return (
      <View style={[estilos.raiz, estilos.conteudo]}>
        <EsqueletoDaLista />
      </View>
    );
  }

  return (
    <FlatList
      style={estilos.raiz}
      data={lista}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={[estilos.conteudo, lista.length === 0 && estilos.vazio]}
      ListHeaderComponent={erro ? <Aviso mensagem={erro} /> : undefined}
      ListEmptyComponent={
        erro ? undefined : (
          <EstadoVazio titulo="Nenhum checklist respondido" descricao="Este local ainda não tem checklist enviado." />
        )
      }
      renderItem={({ item }) => (
        <View style={estilos.item}>
          <View style={estilos.itemTopo}>
            <Text style={estilos.itemTitulo}>{item.modelo}</Text>
            <View style={[estilos.selo, { backgroundColor: COR_DO_STATUS.FINALIZADO.fundo }]}>
              <Text style={[estilos.seloTexto, { color: COR_DO_STATUS.FINALIZADO.texto }]}>Finalizado</Text>
            </View>
          </View>
          <Text style={estilos.itemApoio}>
            Nº {item.numeroAno} · {item.quando}
          </Text>
        </View>
      )}
    />
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { ...colunaDeLeitura, padding: espaco.interno, gap: espaco.entreItens },
  vazio: { flexGrow: 1, justifyContent: "center" },
  item: {
    backgroundColor: cores.superficie,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.interno,
    gap: 4,
  },
  itemTopo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaco.minimo },
  itemTitulo: { ...texto(tipografia.destaque, { cor: cores.texto }), flex: 1 },
  itemApoio: texto(tipografia.nota, { cor: cores.textoFraco }),
  selo: { borderRadius: raio.pilula, paddingHorizontal: espaco.minimo, paddingVertical: 2 },
  seloTexto: texto(tipografia.nota, {}),
});
