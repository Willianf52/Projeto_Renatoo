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
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const raizDoProjeto = __dirname;
const raizDoWorkspace = path.resolve(raizDoProjeto, "../..");

const config = getDefaultConfig(raizDoProjeto);

// 1) Observar o workspace inteiro, para o shared ser recompilado ao mudar.
config.watchFolders = [raizDoWorkspace];

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
