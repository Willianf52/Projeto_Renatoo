/**
 * Observabilidade do app de campo -- o lado que NAO conhece o Sentry.
 *
 * O painel ja tinha Sentry desde o comeco (`sentry.server.config.ts`,
 * `instrumentation-client.ts`); este par de arquivos fecha o outro lado. Ate
 * aqui o app que roda na mao do inspetor era o unico pedaco do sistema que
 * nao contava nada quando quebrava -- e e o pedaco que roda longe de
 * qualquer suporte, dentro de uma planta, as vezes sem sinal.
 *
 * POR QUE PORTA E ADAPTADOR, E NAO UM ARQUIVO SO. O SDK do Sentry importa o
 * `react-native`, que e Flow e nao passa pelo parser do vitest. Um import
 * dele aqui contaminaria o grafo de TODO modulo que chamasse uma captura --
 * e `sincronizacao.ts` e `envio-de-checklist.ts`, os dois pontos que mais
 * precisam ser instrumentados, sao justamente os que tem teste node puro.
 * Descoberto na pratica: a primeira versao deste arquivo importava o SDK
 * direto e derrubou `sincronizacao.test.ts`, que nao tem nada a ver com
 * telemetria.
 *
 * Entao aqui ficam a decisao e a interface; o SDK mora em
 * `observabilidade-sentry.ts`, importado so pelo `index.ts`. Quem instrumenta
 * codigo de campo importa este arquivo e continua testavel sem mock nenhum.
 *
 * INERTE SEM DSN, de proposito, e pela mesma razao do painel: dev e build de
 * homologacao nao devem despejar evento no projeto de producao sem ninguem
 * ter decidido isso. Sem destino registrado as funcoes viram no-op silencioso
 * -- o app nao deixa de abrir por causa de telemetria.
 *
 * SEM DADO PESSOAL. `identificarInspetor` leva so o uuid da conta -- nunca
 * nome, e-mail ou login. O uuid basta para cruzar um erro com uma ronda em
 * `docs/lgpd-privacidade.md`; o resto seria coleta que ninguem pediu.
 */

/** Para onde os eventos vao. O adaptador do Sentry preenche isto no boot. */
export type DestinoDeEventos = {
  erro(excecao: unknown, etiquetas: Record<string, string>): void;
  aviso(mensagem: string, etiquetas: Record<string, string>, detalhe: Record<string, unknown>): void;
  usuario(id: string | null): void;
};

let destino: DestinoDeEventos | null = null;

/**
 * O DSN esta configurado?
 *
 * Mora aqui, e nao no adaptador, para ser conferivel em teste node: e a
 * decisao que governa se o app fala com o mundo, e decisao nao deve morar
 * atras de um import que o teste nao consegue carregar.
 */
export function temDestinoConfigurado(): boolean {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  return typeof dsn === "string" && dsn.trim().length > 0;
}

/** Chamada pelo adaptador depois de inicializar o SDK. */
export function registrarDestino(novo: DestinoDeEventos | null): void {
  destino = novo;
}

/**
 * Erro de verdade -- excecao que ninguem esperava.
 *
 * `etiquetas` vira tag, nao corpo da mensagem: tag e filtravel no Sentry, e o
 * que se quer perguntar la e "quantas falhas no envio de checklist esta
 * semana", nao ler uma a uma.
 */
export function capturarErro(excecao: unknown, etiquetas: Record<string, string> = {}): void {
  destino?.erro(excecao, etiquetas);
}

/**
 * Falha esperada da operacao de campo: a fila tentou subir e o servidor (ou o
 * esquema, ou o RLS) recusou.
 *
 * Vai como AVISO, e nao como excecao, porque nao e um bug do app -- e o mesmo
 * texto que `registrarFalha` ja grava em `ultimo_erro` na fila local. A
 * diferenca e que ali ele morre no aparelho: so aparece se alguem pegar o
 * telefone do inspetor e olhar. Aqui ele vira numero agregado, que e o unico
 * jeito de descobrir que *todos* os aparelhos estao apanhando da mesma policy.
 *
 * `chave` e o numero da coleta, nao dado pessoal -- e o que permite achar a
 * ronda no painel depois.
 */
export function capturarFalhaDeCampo(etapa: string, chave: string, erro: string): void {
  destino?.aviso(`Falha na fila de campo: ${etapa}`, { etapa, chave }, { erro });
}

/**
 * Amarra os proximos eventos a uma conta. So o uuid.
 *
 * Desfeita no logout -- sem o par, o aparelho compartilhado entre turnos
 * atribuiria o erro de um inspetor ao anterior.
 */
export function identificarInspetor(id: string): void {
  destino?.usuario(id);
}

/** Desfaz `identificarInspetor`. Chamada no logout e na sessao expirada. */
export function esquecerInspetor(): void {
  destino?.usuario(null);
}
