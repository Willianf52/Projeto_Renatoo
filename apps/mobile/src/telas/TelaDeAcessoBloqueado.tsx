import { StyleSheet, Text, View } from "react-native";

import type { PerfilDoInspetor } from "../auth/SessaoProvider";
import { Botao } from "../componentes/Botao";
import { Cartao } from "../componentes/Cartao";
import { Marca } from "../componentes/Marca";
import { cores, espaco, texto, tipografia } from "../tema";

type Motivo = "inativo" | "sem-perfil" | "app-desatualizado";

/**
 * Sessao valida que ainda assim nao pode inspecionar.
 *
 * Isto e cortesia de interface, nao seguranca: quem decide e o RLS, via
 * `e_inspetor()` (0036). Mesmo que esta tela fosse burlada, a policy recusaria
 * a gravacao. O que ela evita e o inspetor descobrir que a conta esta inativa
 * so depois de preencher uma visita inteira em campo.
 *
 * `app-desatualizado` e o unico motivo que chega aqui SEM sessao: o portao de
 * versao roda antes do login (ver `Navegacao`), porque um build velho pode
 * escrever com contrato velho e ninguem quer descobrir isso pelo relatorio do
 * mes seguinte. Por isso `aoSair` e opcional -- nao ha de onde sair.
 */
export function TelaDeAcessoBloqueado({
  motivo,
  perfil,
  aoSair,
}: {
  motivo: Motivo;
  perfil: PerfilDoInspetor | null;
  aoSair?: () => void;
}) {
  const { titulo, texto: mensagemDoMotivo } = mensagem(motivo);

  return (
    <View style={estilos.raiz}>
      {/* A marca fica: e o que diz que o app nao quebrou, so nao liberou. */}
      <View style={estilos.marca}>
        <Marca altura={32} />
      </View>

      <Cartao estilo={estilos.cartao}>
        <Text style={estilos.titulo}>{titulo}</Text>
        <Text style={estilos.texto}>{mensagemDoMotivo}</Text>

        {perfil ? <Text style={estilos.conta}>Conectado como {perfil.email}</Text> : null}

        {/* Secundario, e nao primario: sair daqui e o caminho de saida, nao a
            acao que se quer incentivar -- o verde chamaria para o lugar
            errado. Mesma leitura do `variant="secondary"` no painel.

            Ausente no `app-desatualizado`: nao ha sessao para encerrar, e um
            botao que nao resolve o bloqueio so daria ao inspetor a impressao
            de que ha o que tentar. */}
        {aoSair ? (
          <Botao
            titulo="Sair"
            aoPressionar={aoSair}
            variante="secundaria"
            larguraTotal
            estilo={estilos.botao}
          />
        ) : null}
      </Cartao>
    </View>
  );
}

function mensagem(motivo: Motivo) {
  if (motivo === "app-desatualizado") {
    return {
      titulo: "Atualize o aplicativo",
      // Sem instrucao de "vá na loja": a distribuicao e interna (perfil
      // `preview` do eas.json, APK entregue pela supervisao). Dizer o caminho
      // errado e pior do que nao dizer caminho nenhum.
      texto:
        "Esta versão não é mais aceita. Peça a atualização à supervisão antes de iniciar a ronda.",
    };
  }

  if (motivo === "inativo") {
    return {
      titulo: "Conta inativa",
      // Conta nova nasce inativa por padrao (migration 0019, coberta pelo
      // pgTAP `conta_nova_nasce_inativa_test.sql`) -- alguem da gestao precisa
      // ativar no painel.
      texto: "Sua conta ainda não foi ativada. Peça a liberação à supervisão.",
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
    padding: espaco.confortavel,
  },
  marca: { marginBottom: espaco.secao },
  // `padding` maior que o do cartao de lista: aqui ele e o conteudo da tela
  // inteira, nao um item entre varios.
  cartao: { padding: espaco.confortavel, width: "100%", maxWidth: 320 },
  titulo: texto(tipografia.subtitulo, { cor: cores.texto }),
  texto: {
    ...texto(tipografia.apoio, { cor: cores.textoFraco }),
    marginTop: espaco.entreItens,
  },
  conta: {
    ...texto(tipografia.nota, { cor: cores.textoFraco }),
    marginTop: espaco.entreItens,
  },
  botao: { marginTop: espaco.confortavel },
});
