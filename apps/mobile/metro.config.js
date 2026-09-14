// Configuracao de monorepo para o Metro.
//
// Sem isto o bundler nao encontra `@projeto-renatoo/shared`: o pnpm liga os
// pacotes do workspace por symlink, e o Metro so olha dentro da pasta do
// projeto por padrao. As tres linhas abaixo sao o arranjo documentado pelo
// Expo para monorepo, com a parte do `disableHierarchicalLookup` que o pnpm
// exige em especifico.
//
// Nota sobre `packages/shared`: ele publica TypeScript cru (`main` aponta para
// `src/index.ts`), e o Metro transpila isso normalmente por estar dentro de
// `watchFolders`. O import de `database-types.ts` aponta para fora do pacote,
// para `src/lib/supabase/database.types.ts` do painel web -- mas e
// `export type`, apagado pelo Babel antes do bundle. Nenhum arquivo do web
// entra no APK por causa dele.
const fs = require("node:fs");
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const raizDoProjeto = __dirname;
const raizDoWorkspace = path.resolve(raizDoProjeto, "../..");

const config = getDefaultConfig(raizDoProjeto);

/**
 * Onde o pnpm guarda o store virtual (a pasta `.pnpm`).
 *
 * Derivado do `realpath` de uma dependencia, e nao escrito a mao: o caminho
 * muda de maquina para maquina quando `virtualStoreDir` esta configurado, e
 * um literal aqui quebraria a CI.
 *
 * O symlink aponta para `<store>/<pacote>@<versao>_<hash>/node_modules/<pacote>`,
 * dai os tres niveis acima. Devolve `null` se algo nao resolver -- e melhor
 * cair no comportamento antigo do que derrubar o bundler por causa disto.
 */
function raizDoStoreVirtual() {
  try {
    const real = fs.realpathSync(path.join(raizDoProjeto, "node_modules", "expo"));
    return path.resolve(real, "../../..");
  } catch {
    return null;
  }
}

const storeVirtual = raizDoStoreVirtual();

// Fora da raiz do workspace? So quando `virtualStoreDir` foi movido. No lugar
// padrao isto da `<raiz>/node_modules/.pnpm`, que ja esta coberto.
const storeEstaForaDoWorkspace =
  storeVirtual !== null && path.relative(raizDoWorkspace, storeVirtual).startsWith("..");

// 1) Observar o workspace inteiro, para o shared ser recompilado ao mudar.
//
// 1b) E o store do pnpm junto, quando ele mora fora da raiz. O Metro nao
// segue symlink para fora de `watchFolders`: sem esta linha, com o store
// deslocado, nem `expo` resolve -- o bundle morre no primeiro import de
// `index.ts`. O store e movido para fora quando o caminho de dentro do
// repositorio estoura o limite de 260 caracteres do ninja ao compilar o
// codegen nativo do Android (ver `virtualStoreDir` no pnpm-workspace.yaml).
config.watchFolders = storeEstaForaDoWorkspace
  ? [raizDoWorkspace, storeVirtual]
  : [raizDoWorkspace];

// 2) Procurar dependencia nos dois node_modules, nesta ordem.
config.resolver.nodeModulesPaths = [
  path.resolve(raizDoProjeto, "node_modules"),
  path.resolve(raizDoWorkspace, "node_modules"),
];

// 3) `disableHierarchicalLookup` fica DESLIGADO (padrao), e isso e especifico
// do pnpm.
//
// A receita que circula para monorepo liga essa opcao, mas ela pressupoe
// hoisting: com npm/yarn toda dependencia acaba achatada num node_modules so,
// entao restringir a busca aos caminhos acima e seguro. O pnpm faz o oposto --
// guarda cada dependencia transitiva aninhada em
// `.pnpm/<pacote>/node_modules/`. Ligar a opcao aqui quebrou o bundle na hora:
//
//   Unable to resolve "@react-navigation/core" from
//   node_modules/.pnpm/@react-navigation+native@7.../node_modules/@react-navigation/native/lib/module/index.js
//
// `@react-navigation/native` depende de `@react-navigation/core`, que nao esta
// em nenhum dos dois `nodeModulesPaths` -- esta aninhado ao lado do proprio
// pacote. Subir a arvore e como se acha, e e o comportamento padrao.
//
// Duplicata de `react` (o motivo pelo qual a receita liga a opcao) nao e risco
// aqui: o pnpm resolve uma unica instancia pelo store, e web e mobile nao
// compartilham arvore de execucao.

module.exports = config;
