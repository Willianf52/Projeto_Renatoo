# Melhorias do Sistema — Revisão Fullstack

Levantamento feito lendo middleware, RLS, fluxo de auth e as telas do dashboard.
Organizado por prioridade. Cada item cita o arquivo/linha onde o problema
aparece hoje.

> Última revisão: 2026-08-06. A lista foi podada do que já entrou — o histórico
> fica em "Itens fechados", no fim, para não reabrir discussão já resolvida.
> Segurança tem documento próprio (`AUDITORIA-SEGURANCA.md`); aqui só entra o
> que não é achado de auditoria.
>
> **A numeração é sequencial e muda a cada revisão** — markdown renumera lista
> ordenada sozinho, então não adianta tentar preservar o número de um item
> fechado. Por isso a tabela do fim identifica cada item pelo nome, não pelo
> número, e referência entre itens também: número aqui não é identificador.
>
> Esta revisão mudou o ângulo: até aqui a lista media o projeto contra si mesmo
> (o que está construído está bem construído?). Passou a medi-lo contra o
> sistema de referência — **o que ainda não existe**. Daí os itens novos de
> alta prioridade serem todos de ausência, não de defeito.
>
> Rodada seguinte: o painel inicial (item 1) foi construído e depois retirado
> a pedido nesta mesma sessão — fica registrado como estava, não fechado. Os
> itens 3, 5, 9 e 10 entraram em "Itens fechados". O item 2 segue aberto por
> depender de confirmação externa (quem conhece a tela original) que este
> ambiente não tem como obter sozinho.
>
> 2026-08-07: confirmado com o dono do produto que `/dashboard` cair direto em
> Coletas Importadas **é o comportamento esperado**, não uma lacuna — o item
> "painel inicial" saiu de "Alta prioridade" e foi para "Itens fechados" como
> decisão de produto, não pendência técnica.
>
> 2026-08-15: teste funcional de ponta a ponta (telas de escrita, com conta
> real) achou um bug de dado, não só de tela — entrou direto em "Itens
> fechados" já corrigido.
>
> 2026-08-15: confirmado com o dono do produto o significado dos três
> filtros de `coletas-importadas` que estavam com semântica assumida —
> "Localização", "Tipo" e "Checkpoint" interpretam os campos exatamente como
> a implementação já fazia. Item saiu de "Média prioridade" para "Itens
> fechados".
>
> 2026-08-16: achado do advisor de segurança do Supabase (funções
> `SECURITY DEFINER` chamáveis via RPC por `anon`/`authenticated`) fechado
> em duas migrations — a segunda (0028) corrigindo um resíduo que a
> primeira (0027) deixou aberto por engano de sessão anterior. Direto em
> "Itens fechados", nunca esteve nesta lista como item aberto.
>
> 2026-08-16: tentativa de ligar a proteção contra senha vazada (item 8)
> pelo painel do Supabase recusada pelo próprio Supabase — exige plano Pro.
> Item permanece aberto, mas a causa mudou de "toggle manual pendente" para
> "depende de decisão de upgrade de plano".
>
> 2026-08-16: primeira rodada do advisor `performance` do Supabase (nunca
> conferido antes nesta lista, só o de `security`). Três grupos de achado,
> todos fechados no mesmo dia: RLS reavaliando `auth.uid()` por linha
> (migration 0029), FKs sem índice (migration 0030), e índices "não usados"
> — este último por decisão consciente de manter, não por correção. Item
> nunca ficou aberto por mais de algumas horas nesta lista.
>
> 2026-08-16: auditoria de segurança pedida explicitamente (RLS, controle de
> acesso, validação de entrada, headers/segredos) não achou nada Crítico/Alto
> — o que já estava fechado nesta lista cobre a maior parte do escopo pedido.
> Dos achados Médio/Baixo, dois viraram ação: item 8 ganhou compensação na
> aplicação (detalhe na entrada do item) e item 9 ganhou a migration pronta
> (não aplicada). Os outros dois foram avaliados e conscientemente não
> mexidos: `script-src 'unsafe-inline'` em produção é o mesmo trade-off já
> documentado em `lib/security-headers.ts` (nonce por rota foi tentado antes
> e quebrou a hidratação da tela de login estática — não repetido sem
> necessidade concreta), e o bloqueio de tentativas de login no
> `LoginForm.tsx` é UX declarada como tal no próprio comentário do arquivo,
> não a defesa real (que é o rate limit do GoTrue) — nada para corrigir ali.
>
> 2026-08-19: auditoria pedida de fora do ângulo habitual — não "o que está
> construído está bem construído?", mas "o que acontece quando isto entrar em
> operação?". **"Alta prioridade: nenhum item aberto" durou até essa pergunta
> ser feita**, e a categoria voltou com quatro itens. Três são de ausência
> (registro de importação, trilha de auditoria, dado real em produção) e um é
> defeito de resultado, não de tela: três relatórios truncam em silêncio e
> exibem número errado. O que mudou não foi o sistema, foi a régua — nenhum
> destes itens apareceria medindo o projeto contra ele mesmo.
>
> Da mesma auditoria, o que **não** entrou nesta lista, por serem achados de
> segurança/governança e terem documento próprio: repositório GitHub público,
> deploy de produção saindo de branch de trabalho, sessão sem timeout de
> inatividade, MFA desligado, e a premissa vencida no comentário de
> `lib/rate-limit.ts` ("processo único" não vale em serverless). Vão para
> `docs/auditoria-seguranca.md`.
>
> 2026-08-20: o item "Três dos seis relatórios devolvem número truncado"
> foi corrigido e foi para os fechados — o único dos quatro de Alta que era
> defeito, e não ausência. A correção não copiou o padrão dos dois irmãos:
> `LIMITE_LEITURAS + 1` responde "cortei em N" para uma tela que **lista** N
> linhas, e estes três não listam, agregam — cortar em N dá um total errado do
> mesmo jeito. Passaram a buscar o resultado inteiro em páginas
> (`lib/supabase/query-helpers.ts`), com teto de 100 mil linhas como trava
> contra varredura sem fim. O teto continua sendo curativo, e a correção
> estrutural segue sendo o item de Média (agregar em SQL); a diferença é que
> agora o curativo avisa quando não deu conta, em vez de exibir número errado
> com cara de certo.
>
> Dois achados dessa rodada foram avaliados e **não** viraram item, por já
> estarem decididos: o painel inicial em `/dashboard` segue como decisão de
> produto de 2026-08-07 (a auditoria argumenta a favor de revisitá-la quando
> houver dado real, mas revisitar é decisão do dono do produto, não pendência
> técnica), e os testes pgTAP/Playwright fora do CI já têm motivo registrado
> nos fechados — Docker ausente e rate limit de auth do Supabase, não
> esquecimento.
>
> 2026-08-21: o item "Nada registra que um lote de importação foi recebido"
> fechou por completo -- tabela `importacoes` (migration 0033), a rota
> gravando cada tentativa (sucesso e as três recusas: 400, 422, 502), e os
> dois alertas proativos (lote recusado, silêncio prolongado; ver a entrada
> mais abaixo, mesmo dia). A tela de leitura chegou a ser construída
> (`Inspeções → Importações`) e foi retirada a pedido do dono do produto no
> mesmo dia: só `Coletas Importadas` e `Relatórios` sob Inspeções. A tabela
> continua gravando normalmente; consulta é direto no banco (ver
> `docs/importacao-de-coletas.md`).
>
> 2026-08-21: o item "Nenhuma alteração de cadastro é rastreável a uma pessoa"
> foi para os fechados — tabela `auditoria` (migration 0034) alimentada por
> trigger em `sites`/`grupos_sites`/`grupos_usuarios`/`qr_codes`. Uma tela de
> leitura (`Cadastros → Auditoria`) chegou a ser construída no mesmo dia e foi
> retirada a pedido do dono do produto -- a tabela continua gravando
> normalmente, consulta é direto no banco. `profiles` ficou de fora do trigger
> de propósito (escreve com `service_role`, que não carrega `auth.uid()`) e é
> gravada explicitamente por `usuarios/actions.ts` — mesmo resultado final,
> mecanismo diferente porque a tabela é a exceção do grupo. O ensaio do pgTAP
> pegou um segundo problema no caminho: o advisor `security` acusou
> `registrar_auditoria()` executável por `authenticated` via RPC direto mesmo
> depois do `revoke all from public` — a mesma lição das migrations 0026/0028
> (revoke de PUBLIC não remove grant nominal que o default privilege do
> Supabase concede a `authenticated`). Corrigido na migration 0035, aplicada
> no mesmo dia.
>
> 2026-08-21: a metade "aviso proativo" do item de importações também fechou,
> no mesmo dia das duas anteriores. Dois alertas por e-mail
> (`lib/resend.ts`, `enviarAlertaOperacional`): lote recusado dispara dentro
> da própria rota (throttle de 1 e-mail/15min via `limitarTaxa`, pra reenvio
> repetido do mesmo lote quebrado não virar spam), e silêncio prolongado via
> `GET /api/cron/verificar-importacoes` + Vercel Cron (`vercel.json`, uma vez
> por dia -- mais frequente exige plano Pro). Duas decisões sem informação
> real pra calibrar, ambas assumidas e documentadas como tal: **canal** é
> e-mail sem domínio verificado (`ALERTA_OPERACAO_EMAIL` precisa ser o mesmo
> endereço do dono da conta Resend -- o projeto não tem domínio próprio,
> só o subdomínio compartilhado da Vercel, que não permite registro DNS
> arbitrário pra verificação); **limiar de silêncio** é 24h por padrão
> (`IMPORTACAO_SILENCIO_HORAS`), sem cadência real de integração ainda
> estabelecida pra calibrar contra. Os dois ficam triviais de trocar depois
> (variável de ambiente, sem mudar código) quando houver domínio verificado
> e/ou uso real. Cálculo do silêncio isolado em `lib/importacao-alerta.ts`,
> puro e testado (8 casos) sem precisar mockar Supabase nem Resend.
>
> 2026-08-21: início da expansão mobile (15 inspetores em campo, decisão de
> produto — não é achado de auditoria, é iniciativa nova, plano completo em
> "Abrindo o Portão", Artifact publicado). Marcos 01+02 do plano concluídos:
> migration 0036 adiciona o cargo `INSPETOR` (mesmo eixo de `cargo`, que já
> responde "quanto a conta enxerga e altera" — não é escopo novo como `tipo`,
> 0019) e abre `INSERT` em `visitas`/`leituras` para esse cargo, escopado ao
> próprio `funcionario_id` — as únicas duas tabelas que desde a 0003/0004 só
> recebiam escrita de `service_role`. Só INSERT de propósito (decisão de
> produto): o app não permite editar leitura já enviada nesta fase, então a
> trilha de auditoria (0034) não precisa se estender a estas tabelas ainda.
> Escopo por site nasce do QR escaneado (`qr_codes.site_id`), sem tabela de
> vínculo inspetor↔site nova. Ensaiado com pgTAP na mesma transação da
> migration, rollback: 6/6 — o primeiro ensaio pegou um falso-positivo (tentar
> escrever via `insert ... select ... from tabela-com-RLS` deixa a policy de
> SELECT filtrar a linha antes do INSERT ser tentado, sem exceção nenhuma;
> corrigido capturando ids numa tabela temporária sem RLS antes de trocar de
> role). Marcos 03-05 (prova de offline num dispositivo real, geração de tipos
> automática, piloto com 1-2 inspetores) continuam abertos.
>
> 2026-08-21, mesmo dia: marco 04 concluído antes do 03, de propósito — tipo
> mantido à mão é exatamente o tipo de risco que um app novo não deveria
> herdar, e a comparação achou drift real: `database.types.ts` já estava sem
> `e_inspetor()` (só criada nesta sessão) e ainda listava `show_limit`/
> `show_trgm`, funções do `pg_trgm` que a migration de mover a extensão para
> `extensions` (2026-08-17) tirou do schema `public`. Corrigido, e
> `pnpm run types:generate` (README, seção "Banco de dados") documentado como
> o caminho de regeneração -- usa a Management API do projeto hospedado, não
> precisa de Docker nem de `supabase start`.

## Alta prioridade

3. **Nada foi exercitado com dado real: produção está vazia.**
   Consulta direta ao projeto `UpServiços` (2026-08-19): 0 leituras, 0 visitas, 0
   sites, 0 QR-codes, 0 grupos de usuários, 1 perfil (um GESTOR). Projeto criado em
   27/07, com deploys de produção rodando desde então. As sete features estão
   implementadas, testadas e no ar; nenhuma encontrou dado nem usuário real, e a
   meta é 34 usuários (15 inspetores, 19 administrativos).

   É a versão em produção da ressalva que fecha esta lista há revisões ("o que nada
   nesta revisão pôde verificar"), e a razão de esta categoria ter passado tanto
   tempo vazia: a lista mede o sistema contra si mesmo, e contra si mesmo ele está
   bem. Popular o cadastro, ligar a integração de verdade e rodar um mês fechado com
   um subconjunto de inspetores é o que valida o item de importações acima e a
   trilha de auditoria (nos fechados) — e todo problema que aparecer aí é mais
   barato agora do que depois de apresentado à diretoria.

## Média prioridade

3. **Os seis relatórios agregam em Node, não em SQL.** Todos buscam linhas de
   `leituras` e agrupam em memória: somar duração `Término - Início`, contar
   visitas distintas, montar a grade Local × dia. Funciona e está bem testado,
   mas paga transferência de rede por linha para fazer no JavaScript o que o
   Postgres faz em milissegundos — e o teto que o item 1 da Alta vai introduzir é
   um curativo, não a correção: um relatório que avisa "truncado em 5000" ainda é
   um relatório que não responde a pergunta do mês inteiro.

   A correção estrutural é mover a agregação para view ou função SQL, o mesmo
   movimento que este projeto já fez com sucesso ao levar a regra de autorização
   para funções `security definer` (ver "A regra de autorização duplicada em TS e
   em SQL", nos fechados). Fica em Média, e não em Alta, porque só morde com
   volume que ainda não existe — mas é pré-requisito de qualquer painel executivo,
   que precisa de número agregado do período inteiro, sem teto.

7. **`Eventos`, `ChecklistLab` e `Suporte` no menu, desabilitados.**
   `DashboardSidebar.tsx:63-65` — mantidos visíveis de propósito, para
   preservar a estrutura de navegação do sistema de referência. Não têm tabela
   nem tela. Ficam aqui para não se perderem de vista.

7. **Site / Planta não tem `Perda`/`Prevenção` (e-mails de classificação),
   `Notificações Eventos` nem `Tipo de Curva`.** O formulário de referência
   traz os quatro campos; nenhum tem tabela ou coluna correspondente hoje, e
   por decisão explícita (2026-08-10) ficaram de fora do formulário — nem como
   placeholder, diferente do que "Grupo de Inspeção" recebeu em Grupo de
   Sites. Voltam a esta lista de propósito, para não se perderem: entram
   quando alguém decidir o que cada um representa e criar o schema por trás.

## Baixa prioridade / nice-to-have

4. **Teto de 15 caracteres na senha.** `lib/password-policy.ts:43` documenta o
   custo: recusa a saída padrão da maioria dos gerenciadores e qualquer
   passphrase. É paridade exigida com o sistema legado — revisitar quando a
   exigência cair.

6. **"Organização" no navbar é fixa.** `app/dashboard/layout.tsx:45` — já
    marcado como placeholder até existir tabela de organizações. Mantido aqui
    só para não se perder de vista.

10. **`salvarSite`/`salvarGrupoSite`/`salvarGrupoUsuarios`/`salvarQrCode`/`salvarUsuario` reimplementavam,
    cada um, o mesmo extrator de `FormData` e a mesma tabela de tradução de
    erro do Postgres.** Fechado (2026-08-11): `texto()` foi para
    `lib/form-data.ts`, e `traduzirErroPostgres()`/`CODIGO_POSTGRES` para
    `lib/postgrest-errors.ts` — cada `actions.ts` agora só declara as
    mensagens específicas da própria tela. Os limites de tamanho por campo
    (que viviam em mapas paralelos tipo `LIMITES_ENDERECO`/`ROTULOS`,
    percorridos por um `for`) viraram schemas `zod` — limite e mensagem no
    mesmo lugar, por campo, em vez de dois mapas que precisavam ser mantidos
    em sincronia à mão. Regra de negócio cruzada entre campos (auto-referência
    de site/grupo, raio, coordenadas, nível de acesso válido) continua
    imperativa de propósito — não é duplicação, é lógica específica de cada
    tela.

    A decisão pós-escrita também se repetia igual nas quatro telas que
    escrevem com o token da sessão (RLS ativo): `if (error) traduz; if
    (!data) "sem permissão"` depois de todo UPDATE/DELETE/INSERT-com-select —
    o UPDATE/DELETE barrado pelo RLS não devolve erro, devolve zero linhas, e
    sem essa checagem a tela mostraria sucesso com o registro intacto.
    Extraído para `lib/escrita-rls.ts` (`verificarEscritaComRls`), usado em
    `site-planta`, `grupo-de-sites`, `grupo-de-usuarios` (insert, update e
    exclusão) e `qr-code`. `usuarios/actions.ts` fica de fora de propósito —
    escreve com `service_role`, que ignora RLS inteiro, mecanismo diferente.
    Só a decisão foi compartilhada; a consulta em si (tabela, colunas,
    mensagens) continua em cada `actions.ts`, então nenhum `.insert()`/
    `.update()`/`.delete()` existente mudou de forma — os mocks dos testes não
    precisaram mudar.

    Cobertura: os 325 testes existentes passaram inalterados em cada etapa,
    mais 3 novos para `escrita-rls.ts`, com lint/typecheck/build de produção
    limpos ao final.

---

## Itens fechados

Registrados para não voltarem à lista. Identificados pelo nome: o número que
tinham na revisão em que foram levantados não vale mais nada depois que a lista
renumera.

| Item | Como ficou |
|---|---|
| Policies de INSERT do INSPETOR reavaliavam `auth.uid()` por linha (`auth_rls_initplan`, 2026-08-22) | Achado do advisor de performance do Supabase numa rodada de verificação geral da suíte. As duas policies de INSERT criadas pela 0036 (`Inspetor grava a propria visita` em `visitas`, `Inspetor grava leitura da propria visita` em `leituras`) chamavam `auth.uid()` direto no `with check` em vez de `(select auth.uid())` — nasceram depois da 0029 e ficaram fora daquele sweep, que cobriu só as policies de SELECT existentes na época. Pesa mais aqui do que pesou lá: `visitas`/`leituras` são justamente as tabelas que recebem inserção em lote pela rota de importação de coletas (migration 0033), e é no lote que a reavaliação por linha aparece. Migration 0037 recria as duas com a mesma regra de autorização, só a troca mecânica — nenhuma decisão de acesso mudou. Antes de escrever, as definições vivas foram lidas em `pg_policies` para garantir que a cópia batia caractere por caractere com o que estava no ar. Aplicada em produção em 2026-08-22 via `apply_migration`; confirmado em `pg_policies` que as duas passaram a mostrar `( SELECT auth.uid() AS uid)`, e no advisor que nenhum `auth_rls_initplan` sobrou. O `apply_migration` registrou a versão `20260822185701`, diferente do timestamp que o arquivo local tinha ao ser escrito; o arquivo foi renomeado para casar com o remoto, para o histórico não divergir (mesma classe de descuido da 0027, que ficou aplicada sem o arquivo commitado). **Ensaio pgTAP não foi feito**: a máquina não tinha Docker na sessão, então `escrita_de_campo_por_inspetor_test.sql` não rodou nem antes nem depois — diferente do processo usado na 0034, onde o teste rodou em transação com rollback antes de aplicar. O teste é de comportamento e não inspeciona o texto da policy, então continua válido sem alteração; rodar na próxima sessão com Docker fecha a verificação |
| Nenhuma alteração de cadastro era rastreável a uma pessoa | Migration 0034 cria `auditoria` (tabela, registro_id, operação, ator_id, dados_antigos/novos jsonb, criado_em), RLS de leitura para quem `pode_administrar_usuarios()` (GESTOR ativo, migration 0013) e sem policy de escrita. Trigger genérico `registrar_auditoria()` (`security definer`, lê `auth.uid()`) cobre `sites`, `grupos_sites`, `grupos_usuarios` e `qr_codes` -- as quatro que escrevem com o token da sessão. `profiles` fica de fora do trigger de propósito: `usuarios/actions.ts` escreve com `service_role`, que não carrega JWT de pessoa nenhuma, e `auth.uid()` dentro do trigger seria sempre `null` -- um trigger assim daria a impressão de rastreamento funcionando sem rastrear a única coisa que o item pedia ("quem alterou um cargo"). Em vez disso, a action grava em `auditoria` explicitamente, no mesmo código que já sabe quem está editando; a seleção de `atual` (dados antigos) ganhou os campos por extenso (não só `cargo, ativo`) para o diff cobrir nome/login/função/tipo/superior também. Uma tela de leitura (`Cadastros → Auditoria`, com filtro de período/tabela/operação e diff calculado) chegou a ser construída e foi retirada a pedido do dono do produto no mesmo dia -- a tabela continua gravando normalmente, consulta é direto no banco. Aplicada em produção em 2026-08-21 depois do ensaio -- pgTAP `auditoria_test.sql` na mesma transação, rollback: 8/8. Achado no primeiro ensaio: testar DELETE contra `grupos_sites` apagava zero linhas em silêncio (essa tabela só desativa por flag, sem policy de DELETE) e o assert passava pelo motivo errado; trocado para `grupos_usuarios` (a única das quatro com DELETE de verdade, migration 0020). Achado depois de aplicar: o advisor `security` acusou `registrar_auditoria()` executável por `authenticated` via RPC mesmo com `revoke all from public` -- mesma lição das 0026/0028 sobre grant nominal do default privilege; corrigido na migration 0035 no mesmo dia, confirmado no advisor e no `pg_proc.proacl` antes/depois |
| Lote de importação recusado não deixava rastro nenhum (metade "registro" do item) | Migration 0033 cria `importacoes` (origem, status, http_status, linhas recebidas, visitas gravadas, leituras novas, mensagem, detalhe) com RLS de leitura para `authenticated` e sem policy de escrita — grava só a rota, com `service_role`. `api/importar/coletas/route.ts` passou a gravar uma linha em cada tentativa que passa do segredo e do limite de taxa: sucesso e as seis recusas (corpo inválido, lote inválido, referência desconhecida, falha ao consultar referências, falha ao gravar visitas, falha ao gravar leituras). 401/429 ficam de fora de propósito — não são lote, são a rota rejeitando quem não provou ser a integração, e registrá-los viraria alvo de ruído para quem varre a rota sem o segredo. `createAdminClient()` subiu para antes da leitura do corpo, porque corpo inválido e lote inválido também precisam virar linha. Registro é best-effort: falha ao gravar em `importacoes` vira `erro()`, nunca 502 para quem importou certo. **Aplicada em produção em 2026-08-21**, depois do ensaio (pgTAP `importacoes_test.sql` na mesma transação, rollback: 3/3). Advisor `security` depois: nenhum achado novo. Uma tela de leitura (`Inspeções → Importações`) chegou a ser construída no mesmo dia e foi retirada a pedido do dono do produto -- Inspeções fica só com `Coletas Importadas` e `Relatórios`; a tabela continua gravando normalmente, consulta é direto no banco |
| Aviso proativo de importação não existia (metade "alerta" do item acima) | Dois alertas por e-mail via `enviarAlertaOperacional` (`lib/resend.ts`), os dois best-effort. **Lote recusado**: dispara dentro de `api/importar/coletas/route.ts` em qualquer uma das seis recusas, com `limitarTaxa` limitando a 1 e-mail/15min (reenvio repetido do mesmo lote quebrado não vira spam; o registro em `importacoes` continua sem esse limite). **Silêncio prolongado**: `GET /api/cron/verificar-importacoes`, alvo de um Vercel Cron Job (`vercel.json`, uma vez por dia -- mais frequente exige plano Pro), protegido por `CRON_SECRET` (a Vercel manda `Authorization: Bearer` sozinha quando a variável está configurada). Cálculo isolado em `lib/importacao-alerta.ts` (`calcularSilencio`, `limiteDeSilencioHoras`, `montarMensagemDeSilencio`), puro e testado sem mockar Supabase/Resend. Duas decisões assumidas sem dado real pra calibrar: canal é e-mail sem domínio verificado (`ALERTA_OPERACAO_EMAIL` precisa ser o mesmo endereço do dono da conta Resend -- o projeto não tem domínio próprio, só o subdomínio compartilhado da Vercel, que não aceita registro DNS pra verificação) e o limiar de silêncio é 24h por padrão (`IMPORTACAO_SILENCIO_HORAS`), sem cadência real de integração estabelecida ainda. Os dois viram variável de ambiente, sem mudar código, quando houver domínio verificado e/ou uso real pra calibrar |
| Três dos seis relatórios devolviam número truncado, sem avisar | `horas-por-usuario`, `mapa-de-locais-inspecionados` e `ranking-de-inspecoes` selecionavam `leituras` sem `.range()` e agregavam o que voltasse — o `max_rows = 1000` do PostgREST cortava a consulta **sem erro**, e o total saía por baixo com cara de certo. `buscarEmPaginas` (`lib/supabase/query-helpers.ts`) passa a buscar o resultado inteiro em páginas, e os três expõem `truncado` para tela, CSV e PDF quando o teto de 100 mil linhas é atingido (mais um `erro()` com id de requisição, porque é evento operacional). Duas decisões dentro do helper valem nota: ele avança pelo que **voltou**, não pelo que pediu — parar na primeira página "menor que a pedida" reintroduz o bug original quando o `max_rows` do ambiente é menor que a página —, e quem chama precisa ordenar a consulta, senão `.range()` troca "número menor que o real" por "número aleatório". `ranking-de-inspecoes` levou a correção a mais que o item pedia: ganhou o gate `if (!dataInicial || !dataFinal) return null` dos outros dois, com teste. **Mudança de comportamento:** a tela agora abre pedindo o período, em vez de exibir um ranking de todo o histórico |
| Proteção contra senha vazada desligada no Supabase Auth (`get_advisors`, 2026-08-11) | O toggle nativo ("Prevent use of leaked passwords", Authentication → Sign In / Providers → Email) exige plano Pro — tentativa de ativação em 2026-08-16 recusada pelo próprio Supabase. **2026-08-16: dono do produto decidiu não fazer upgrade de plano** — deixa de ser pendência dependente de decisão e vira decisão tomada. Compensação ficou na aplicação, no mesmo dia: `lib/senha-vazada.ts` consulta a API k-anonymity do HaveIBeenPwned (só um prefixo de 5 caracteres do SHA-1 sai do servidor, nunca a senha) nos três pontos onde senha é definida — `usuarios/actions.ts` (server action, checagem direta) e `nova-senha`/`trocar-senha` (client components que chamam `supabase.auth.updateUser` direto, sem server action no meio — checam via nova rota `api/senha/verificar-vazamento` antes de chamar `updateUser`). Falha aberta em timeout/erro de rede: é checagem adicional, não defesa de borda. Risco residual aceito conscientemente, não escondido: contas criadas direto pelo painel/console do Supabase (fora da aplicação) não passam por este código — mesma categoria de exposição que qualquer ação feita por quem já tem acesso administrativo ao projeto Supabase, não um caminho que um usuário comum alcança |
| Sentry ligado no código (2026-08-11), inerte até existir um DSN | Conta e projeto criados em 2026-08-16 (`up-servicos/javascript-nextjs`, região EU). `npx @sentry/wizard` rodou em duas etapas por causa de uma dependência faltando na máquina (`pnpm` não instalado — resolvido com `npm install -g pnpm@11.18.0`, a versão que `package.json` já declarava via `packageManager`). O wizard gerou `sentry.server.config.ts`/`sentry.edge.config.ts` mas **não** os conectou ao `instrumentation.ts` que já existia (o wizard não sobrescreve um `register()` customizado) — os dois ficariam órfãos, nunca executados, com o DSN além disso hardcoded no arquivo em vez de vir de env. Corrigido: `instrumentation.ts` passou a delegar via `await import("../sentry.server.config")`/`sentry.edge.config` (padrão atual do SDK), e os dois arquivos passaram a ler `process.env.SENTRY_DSN`. Também achado e corrigido: o `tunnelRoute: "/monitoring"` que o wizard configurou (necessário porque a CSP deste app restringe `connect-src` a `'self'` + Supabase, mesmo motivo do proxy do ViaCEP em `api/cep`) caía no matcher do middleware de autenticação (`proxy.ts`) — um evento de erro na tela de login, deslogado, seria redirecionado para `/` em vez de chegar ao Sentry; excluído do matcher. `SENTRY_AUTH_TOKEN` (upload de source map) movido do arquivo solto que o wizard cria (`.env.sentry-build-plugin`, apagado) para `.env.local`, mesmo padrão do resto do projeto. Rotas de exemplo do wizard (`sentry-example-page`, `api/sentry-example-api`) removidas depois de confirmar que a rota de teste respondia 500 como esperado. Validado com lint/typecheck/vitest (379/379)/build de produção, incluindo o upload de source map rodando no build. **Pendente:** configurar `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_AUTH_TOKEN` no ambiente de produção (Vercel ou onde o app estiver hospedado) — `.env.local` cobre só o ambiente local |
| Extensão `pg_trgm` instalada no schema `public` (`extension_in_public`, `get_advisors`) | Ficou em `public` desde a migration 0011 por ser o schema corrente no momento do `create extension`, sem decisão deliberada. A hipótese inicial de que mover exigiria recriar os índices GIN estava errada — `alter extension pg_trgm set schema` preserva o OID de cada objeto da extensão, e os índices (`grupos_sites_nome_trgm_idx`, `grupos_sites_descricao_trgm_idx`, `profiles_nome_completo_trgm_idx`, `profiles_email_trgm_idx`) resolvem a classe de operador pelo OID gravado neles, não pelo nome a cada consulta. `extensions` (schema que já hospeda `pgcrypto`/`uuid-ossp`/`pg_stat_statements`/`pgtap` neste projeto) está no `search_path` padrão do Supabase, então migration futura com `gin_trgm_ops` continua funcionando sem qualificar o schema. Migration 0031 aplicada em produção em 2026-08-16; confirmado por SQL direto (`pg_extension`/`pg_namespace`) que a extensão está em `extensions`, os 4 índices continuam existindo com a mesma definição, e o achado `extension_in_public` não aparece mais no `get_advisors` |
| 10 foreign keys sem índice cobrindo (`unindexed_foreign_keys`) | Achado do advisor de performance do Supabase. `leituras.acao_id`/`area_id`/`qr_code_id`/`qualificador_id`, `profiles.superior_id`, `sites.criado_por`/`responsavel_id`/`tipo_servico_id`, `visitas.coletor_dados_id`/`motivo_visita_id` sem índice — DELETE/UPDATE na tabela pai varria a tabela filha inteira para checar integridade referencial, e joins pela FK não tinham por onde entrar. Migration 0030 cria os dez, `create index if not exists`, mesmo padrão de nome das migrations 0011/0018 |
| ~22 índices marcados "não usados" (`unused_index`) — decisão de manter, não correção | Cruzado cada um com o código antes de decidir: os 11 trigram (`grupos_sites`, `profiles` nome/email/login, `sites` nome/sigla/cidade, `qr_codes` código/finalidade, `grupos_usuarios` nome/descrição) sustentam as caixas de busca (`ilike`) de cada tela de cadastro (migrations 0011/0012/0018); `leituras_com_localizacao_idx` é o filtro "Localização" de Coletas Importadas; `grupos_sites_pai_idx` é a hierarquia de Grupo de Sites (0024); os demais (`profiles_cargo_idx`, `visitas_funcionario_id_idx`, `grupos_usuarios_membros_profile_idx`, `sites_grupo_site_id_idx`, `visitas_data_integracao_idx`, `leituras_evento_id_idx`, `leituras_visita_id_idx`) cobrem coluna usada em filtro, RLS ou join hoje. Prova de que "não usado" aqui é sinal de pouco tráfego, não de índice morto: os 10 índices novos da migration 0030 apareceram nesse mesmo advisor como "não usados" segundos depois de criados. Apagar agora derrubaria busca/filtro/hierarquia assim que o uso crescer, e reconstruir os GIN trigram mais tarde, com tabela maior, custa mais caro do que custa hoje. Reavaliar só se algum candidato específico continuar zerado depois de meses de uso real em produção |
| Policies de RLS reavaliavam `auth.uid()` por linha (`auth_rls_initplan`) | Achado do advisor de performance do Supabase. Seis policies chamavam `auth.uid()` direto na cláusula em vez de `(select auth.uid())`: `profiles` (leitura e a de update), `grupos_usuarios_membros`, `grupos_sites_clientes`, `visitas`, `leituras`. Sem o `select`, o Postgres reavalia a chamada a cada linha varrida em vez de uma vez por query. Migration 0029 recria as seis com a mesma regra de autorização, só essa troca mecânica — nenhuma decisão de acesso mudou. Validado rodando os pgTAP existentes que cobrem essas policies (`leitura_de_perfis_test`, `escopo_de_cliente_test`, `update_cargo_ativo_negado_test`): 17/17 asserts passaram, mesmo comportamento de antes. Advisor confirma que os seis `auth_rls_initplan` sumiram |
| Funções `SECURITY DEFINER` de RLS chamáveis por `anon`/`authenticated` via RPC | Achado do advisor de segurança do Supabase. Migration 0027 revogou `EXECUTE` de `anon` em oito funções auxiliares (`e_cliente`, `nivel_acesso_atual`, `pode_administrar_cadastros`, `pode_administrar_grupos_usuarios`, `pode_administrar_usuarios`, `pode_ver_grupo_site`, `pode_ver_toda_operacao`, `usuario_ativo`) — `authenticated` fica de fora de propósito, as policies de RLS chamam essas funções com o privilégio de quem roda a query, não do dono. Nenhuma vazava dado: todas leem só a partir de `auth.uid()`, nulo para `anon`. A 0027 ficou aplicada no banco mas o arquivo não foi commitado na sessão em que foi criada (2026-08-16, 00:03) — detectado e commitado na sessão seguinte. Ao revisar, `handle_new_user()` (trigger de `auth.users`) continuava executável por `anon` **e** `authenticated` mesmo revogada nominalmente: diferente das outras oito, nunca teve `revoke all from public` na criação (migration 0008), então mantinha o grant implícito de `PUBLIC` — e os dois papéis são membros de `PUBLIC`. Migration 0028 revogou de `PUBLIC` diretamente. Confirmado nos grants reais (`proacl`/`has_function_privilege`) antes e depois, não só no advisor. Detalhe técnico completo em `docs/auditoria-seguranca.md` |
| Filtros de `coletas-importadas` com semântica assumida, não confirmada | Confirmado com o dono do produto em 2026-08-15: as três interpretações já implementadas em `queries.ts` (`aplicarFiltrosDeColeta`) estão corretas. "Localização" é presença/ausência de coordenada GPS na própria leitura (`leituras.tem_localizacao`), não um filtro de local; "Tipo" é o `tipo_servico` cadastrado no site da visita (`visitas.sites.tipo_servico_id`), não um tipo da coleta em si; "Checkpoint" é o QR-Code específico onde a leitura foi escaneada (`leituras.qr_code_id`). Nenhum código mudou — o item só saiu de "assumido" para "confirmado" |
| `salvarSite` gravava todo Site / Planta como inativo, sempre | `site-planta/actions.ts:115` lia `formData.get("ativo")`, um campo que não existe no formulário — o Status da tela (`SiteForm.tsx`) é um `<select name="status">` com valores `"ativo"`/`"inativo"`, não um checkbox. Resultado: `ativo` era sempre `false`, em criação **e** edição, e o site sumia em silêncio da listagem (filtro padrão "Ativos"), parecendo que o cadastro tinha falhado. Achado testando a tela com dado real e confirmado direto no banco (site criado com Status = Ativo na tela, gravado com `ativo: false`). Corrigido para ler `status` como `grupo-de-sites/actions.ts` já fazia (`!== "inativo"`); dois testes que atestavam o comportamento errado foram corrigidos, mais um novo cobrindo os três casos (ausente/ativo/inativo) |
| `ToastOnMount` mostrava o toast de sucesso duas vezes | `useEffect` sem guard: o StrictMode do React (dev) monta, "desmonta" e remonta todo efeito sem cleanup de propósito, e `show()` não é idempotente. Reproduzido em Grupo de Usuários (único uso hoje) em toda criação/edição. Corrigido com `useRef` marcando que o efeito já rodou; teste novo (`ToastOnMount.test.tsx`) renderiza dentro de `<StrictMode>` contra o `ToastProvider` real e confere que só um toast chega ao DOM |
| Banco vazio (sem `seed.sql`) não tinha como ser populado só pela tela | `Novo Grupo de Sites` exige ao menos um site existente; `Novo Site / Planta` exige um grupo existente — travam um ao outro quando as duas tabelas partem vazias. Não é bug de código (o multi-select funciona normalmente assim que existe 1 site), é ausência de caminho de bootstrap pela UI; `seed.sql` sempre contornou isso inserindo os dois direto via SQL. Documentado no README, na seção "Banco de dados", para quem for provisionar um ambiente novo sem rodar o seed |
| `/dashboard` sem tela própria (painel inicial) | Confirmado com o dono do produto em 2026-08-07: cair direto em Coletas Importadas ao entrar no sistema **é o comportamento esperado**, não uma ausência a preencher. `metas_visitas` segue sem consulta nenhuma, mas deixa de ser tratado como pendência — só volta à lista se o critério de produto mudar |
| Coluna "Ações" vazia em Coletas Importadas | Não havia ação real para colocar nela — a única candidata (mostrar a coordenada exata da leitura, hoje só usada como presença/ausência no filtro "Localização") foi descartada por decisão de produto. A coluna saiu de `TABLE_COLUMNS`, e `toTableRow` passou a ser a lista completa de campos da linha, sem mais precisar de tratamento especial na página |
| `package-lock.json` local | Apagado da máquina de desenvolvimento — estava fora do controle de versão (`.gitignore`), então a divergência com `pnpm-lock.yaml` não afetava o repositório, só o ambiente local |
| QR-Code não gerava a imagem do QR | Biblioteca `qrcode` adicionada (`lib/qrcode.ts`, PNG em data URL — mais simples e mais seguro que embutir SVG cru). A tela de editar QR-Code mostra o código renderizado para conferência, e o botão "Imprimir Etiquetas" (`export/etiquetas`, componente `FolhaDeEtiquetas`) gera uma folha para impressão com todos os QR do filtro atual — mesmo mecanismo de `ImprimirAoAbrir` que "Exportar para PDF" já usava, mas em grade de cartões em vez de tabela |
| Leitura sem `area` escapava da deduplicação da importação | Migration 0017: a constraint `unique (visita_id, area_id, data_hora)` da 0004 recriada com `nulls not distinct`, para que dois `NULL` em `area_id` colidam como duplicata igual já acontecia com o campo preenchido. `onConflict` da rota de importação não mudou — mesmas colunas, mesmo nome de constraint. pgTAP em `leitura_sem_area_dedup_test.sql` cobre a colisão e o caso que não deveria colidir (instantes diferentes) |
| `Grupo de Usuários` era placeholder — o último do menu | Cadastro completo com seleção de membros (checkboxes com filtro local) + migration 0016. A regra de quem administra **não** é a das 0009/0012/0015, e a diferença é o ponto: `pode_administrar_cadastros()` inclui OPERACIONAL, mas o conteúdo deste cadastro é a lista de pessoas — e a policy da 0006 só devolve a operação inteira para quem `pode_ver_toda_operacao()`. Com apenas o primeiro predicado, um OPERACIONAL criaria um grupo e não veria um único membro para colocar dentro: escrita autorizada sobre dado que ele não alcança. Daí `pode_administrar_grupos_usuarios()` ser a conjunção das duas — colapsa hoje em GESTOR + SUPERVISOR, mas continua correta se qualquer uma das listas mudar. Membros são apagados e recriados a cada salvamento em vez de diferenciados: a tabela é só a chave primária, não há nada a preservar, e o diff custaria um round-trip a mais para chegar no mesmo lugar |
| `QR-Code` era placeholder | Cadastro completo (listagem com busca e filtros de site/grupo/situação, criar/editar, exportar Excel e PDF) + migration 0015 com o padrão de escrita das 0009/0012. Era o mais urgente dos dois porque a rota de importação resolve `checkpoint` pelo código do QR e recusa o lote quando ele não existe — o cadastro era pré-requisito sem tela. Duas decisões próprias: o código só aceita letras, números, ponto, hífen e sublinhado (ele é lido de etiqueta e casado por texto na importação; espaço no meio sobrevive ao `trim` das bordas e produz um cadastro que parece certo na tela e nunca casa com o lote), e a policy de escrita exige `pode_ver_grupo_site()` além de `pode_administrar_cadastros()` — hoje redundante, mas impede que uma combinação futura de nível com escopo pendure checkpoint num site que nem enxerga |
| `CLIENTE` era um nível de acesso que não fazia nada | Migration 0014: tabela `grupos_sites_clientes` (N:N — um contato de holding acompanha mais de um grupo, e começar 1:1 obrigaria a migrar dado depois), helpers `e_cliente()`/`pode_ver_grupo_site()`, e as policies de `grupos_sites`, `sites`, `qr_codes`, `visitas` e `leituras` reescritas para recortar por grupo. Antes disso um CLIENTE logava e via a tela de coletas **vazia** — não "restrita": vazia, sem explicar por quê. Era paridade **e** segurança: as policies das três tabelas de cadastro eram `usuario_ativo()` puro, então ativar um CLIENTE pela tela nova de Usuários entregaria a ele os sites de todos os clientes, com coordenadas, mais o código de todo checkpoint — o mesmo vazamento que a 0008 fechou para conta criada de fora. O predicado é "não é cliente OU o grupo está entre os dele", para quem não é CLIENTE manter exatamente a visão anterior sem depender de vínculo nenhum. A atribuição entra pelo formulário de Usuários (checkboxes que aparecem só no nível CLIENTE), gravada com service_role atrás do mesmo portão da 0013. **Efeito colateral que quase passou:** o cache de referências de `coletas-importadas/queries.ts` guardava `sites`/`grupos_sites`/`qr_codes` entre usuários, apoiado no comentário de que as três não tinham recorte — premissa que a 0014 derruba. As três saíram do cache, e o teste que afirmava o contrário foi invertido. pgTAP em `escopo_de_cliente_test.sql` cobre os dois lados e o caso que quebraria calado (quem não é cliente segue vendo tudo) |
| `Usuários` era só leitura — o sistema não admitia ninguém | CRUD completo (`usuarios/actions.ts`, `UsuarioForm.tsx`, `novo/`, `[id]/editar/`), com 24 testes concentrados no portão de permissão. Combinado com a 0008 (conta nova nasce inativa), **ativar um usuário novo só era possível pelo painel do Supabase**. A escrita usa `service_role` porque `cargo` e `ativo` não têm grant para `authenticated` (0002/0007) e **não devem ter** — são as colunas que definem poder. A consequência é que a checagem na action é o único portão: não há RLS atrás dela. Daí a migration 0013 criar `pode_administrar_usuarios()` (só GESTOR, régua mais estreita que `pode_administrar_cadastros()`, que inclui SUPERVISOR e OPERACIONAL — senão quem cadastra site poderia se promover a GESTOR), a checagem rodar com o cliente da sessão antes de qualquer escrita, e o pgTAP `pode_administrar_usuarios_test.sql` cobrir os cinco níveis mais o gestor inativo. Bloqueia ainda desativar a própria conta e alterar o próprio nível — sem isso o único gestor se tranca para fora |
| `visitas`/`leituras` sem caminho de entrada | `POST /api/importar/coletas` (`app/api/importar/coletas/route.ts` + `lib/importar-coletas.ts`, com 34 testes). As migrations 0003/0004 registravam que a escrita "ocorre no servidor com service_role" — mas a rota nunca existiu, e a tela de Coletas Importadas listava vazio em qualquer ambiente novo: os 14 filtros, a paginação e as duas exportações estavam construídos sobre uma tabela que nada alimentava. Formato achatado (uma linha por leitura, referências por nome), autenticação por segredo compartilhado como o webhook. Contrato em `docs/importacao-de-coletas.md`. **Não exercitado contra banco de verdade** — mesma lacuna do pgTAP |
| `seed.sql` vazio | Semeia as tabelas de referência que a 0004 não cobre (`eventos`, `acoes`, `qualificadores`, `tipos_servico` — select de filtro vazio parece defeito de tela, não tabela sem cadastro) e um grupo de sites com unidades e QR codes, para a importação ter em que se apoiar. Não semeia `visitas`/`leituras` de propósito: mascararia uma importação quebrada com uma tela cheia |
| `Site / Planta` era placeholder | Cadastro completo: listagem com busca livre (nome/sigla/cidade) e filtros de grupo, tipo de serviço e situação; formulário de criar/editar; exportar Excel e PDF. Migration 0012 dá a `sites` o mesmo padrão de escrita que a 0009 deu a `grupos_sites` (grant por coluna + policy em `pode_administrar_cadastros()`), acrescenta `unique (grupo_site_id, nome)`, faz `criado_por` vir de `auth.uid()` por default — para não poder ser forjada — e cobre a busca com índices trigram. Era o placeholder mais crítico: `sites` é o "Local" de toda coleta e do filtro `Locais` |
| `podeAdministrarCadastros` presa dentro de uma tela | Subiu para `lib/permissoes.ts` quando Site / Planta passou a precisar da mesma regra; a alternativa era a segunda tela importar de dentro da pasta da primeira. Mesmo movimento que `escaparLike` → `lib/postgrest-escape.ts`. Testes junto, em `lib/permissoes.test.ts` |
| `pnpm-lock.yaml` fora de sincronia | `@playwright/test` entrou na revisão anterior sem atualizar o lock, e o próximo push quebraria o CI no `--frozen-lockfile`. Resolvido com `npx pnpm@11.18.0 install --lockfile-only` |
| Cookies renovados perdidos no redirect | `preservarSessao()` em `lib/supabase/middleware.ts`, com teste de regressão |
| Cache de referências guardava falha | `getReferenciasCompartilhadas` não grava no cache se alguma consulta trouxe `error` |
| CI não rodava em push para `main` | Gatilho apontado para `branches: [main]`. O required status check "build" já estava marcado na proteção de `cursor/login-page-performance-lab`, mas `enforce_admins` estava `false` — administrador do repositório (papel de quem empurra direto) pulava a checagem obrigatória, confirmado num push real em 2026-08-21 ("Bypassed rule violations"). **Tentativa de ativar `enforce_admins` revertida no mesmo dia**: o CI só roda depois que o push chega na branch (gatilho `push`), então exigir o check já aprovado *antes* de aceitar o push é um impasse -- nenhum push direto passa mais, nem de commit já validado localmente. Bloqueou os dois terminais que trabalham nesta branch (o meu e outro em paralelo). Corrigir de verdade exige mudar o fluxo para branch + Pull Request (CI roda via gatilho `pull_request`, que dá tempo do check existir antes do merge) -- decisão de fluxo de trabalho, não aplicada; ficou só o required check nominal, sem `enforce_admins` |
| Botão "Sair" podia não sair | `DashboardNavbar` checa o retorno de `signOut()`, avisa na tela e libera o botão. Corrigiu junto um segundo defeito: `signingOut` nunca voltava a `false`, então numa falha o botão travava em "Saindo...". Coberto por Playwright hoje só indiretamente (o fluxo de login, não o de logout) |
| Três consultas a `profiles` por requisição | Duas saíram quando `podeAdministrarCadastros()` e `podeVerTodaOperacao()` viraram chamadas RPC às funções `security definer` do banco. A do layout virou `lib/perfil-atual.ts`, memoizada por requisição com `cache()` do React — o ponto não é o número de round-trips hoje, é que tela nova reusa em vez de abrir a sua. A do middleware fica: roda em invocação separada do render, e nenhum cache de requisição atravessa as duas |
| A regra de autorização duplicada em TS e em SQL | `podeAdministrarCadastros()` e `podeVerTodaOperacao()` (`usuarios/queries.ts`, ex-`getNivelAcessoAtual`/`podeVerTodosOsUsuarios`) passaram a chamar `pode_administrar_cadastros()`/`pode_ver_toda_operacao()` via RPC em vez de reimplementar a regra em TS a partir de `cargo`/`ativo`. Fonte única; teste cobre concessão, negação e falha do RPC negando por padrão. O round-trip a menos é o mesmo citado em "Três consultas a `profiles`" |
| `error.tsx`/`not-found.tsx` só no nível do dashboard | `app/error.tsx` e `app/not-found.tsx`, seguindo a identidade visual do login (fundo `brand-navy`, logo, sem depender do `DashboardChrome`) |
| Índices não cobrem buscas nem ordenação real | `supabase/migrations/0011_indices_de_busca_e_ordenacao.sql`: GIN + `pg_trgm` para os `ilike` de `grupos_sites`/`profiles`, índice composto `(data_hora desc, id desc)` em `leituras` no lugar do de coluna única da 0004, e índice em `profiles.nome_completo`. A 0012 estendeu o mesmo tratamento a `sites`. Não testado contra banco local — mesma lacuna do `config.toml` que as policies de RLS tinham (ver abaixo) |
| `combinarDataHora` sem timezone explícito | Deslocamento `-03:00` fixo no timestamp montado (Brasil não observa horário de verão desde 2019, então o deslocamento não varia), com teste cobrindo os três casos (`combinarDataHora`, exportada de `coletas-importadas/queries.ts`). A importação exige o mesmo, pelo mesmo motivo: recusa timestamp sem fuso |
| `packageManager` ausente no `package.json` | Campo `"packageManager": "pnpm@11.18.0"` adicionado; `pnpm/action-setup` no CI não crava mais `version:` — lê do `package.json`, então local e CI não podem mais divergir |
| Cliente Supabase do browser recriado a cada chamada | Singleton de módulo em `lib/supabase/client.ts`: `createClient()` memoiza a instância entre chamadas |
| Botão desabilitado não alcança quem usa teclado | Componente único `components/dashboard/AcaoDesabilitada.tsx`, com `aria-disabled` + `onClick` no-op no lugar do atributo `disabled`, que preserva o foco por teclado. Precisou de `"use client"`: o `onClick` é uma função, e função não atravessa o limite servidor/cliente sem a diretiva |
| `escaparLike` duplicado nas duas telas | Virou `lib/postgrest-escape.ts`, com teste próprio. `escaparPostgrest` foi junto, e a composição dos dois virou `termoParaOr` — a ordem entre eles não é intercambiável e agora está fixada num lugar só |
| As policies de RLS não tinham um teste sequer | `supabase/config.toml` criado (via `supabase init`) e sete suites pgTAP em `supabase/tests/database/`: conta nova nasce inativa/OPERADOR mesmo forjando `raw_user_meta_data` (0005/0008), OPERADOR não lê perfil alheio e GESTOR/SUPERVISOR ativos leem (0006), `anon` não escreve em `grupos_sites` (0010), UPDATE em `cargo`/`ativo` negado para `authenticated` (0007), dedup de leitura sem área (0017), `pode_administrar_usuarios()` (0013) e escopo de CLIENTE (0014). **Executadas (2026-08-11)** direto contra o projeto de produção, cada uma dentro de `begin;...rollback;` própria — branch de desenvolvimento não está disponível no plano atual do Supabase, e é o caminho que fica pendente para quando houver. 32/32 asserts passaram, nada persistiu. Achado no processo: `escopo_de_cliente_test.sql` tinha um bug de sintaxe nunca detectado (`id like` contra coluna `uuid` sem cast) — corrigido para `id::text like`. `pnpm test:db` continua sendo o caminho de verdade quando houver Docker ou branch |
| Nenhum teste de ponta a ponta do fluxo de auth | Playwright instalado (`e2e/`, `playwright.config.ts`, `pnpm test:e2e`). Seis specs rodam sem credencial nenhuma e passam. Login → dashboard e conta inativa barrada estão escritos mas pulam sozinhos sem `E2E_EMAIL`/`E2E_PASSWORD`/`E2E_INACTIVE_EMAIL`/`E2E_INACTIVE_PASSWORD`. Fora do CI de propósito: rodar contra o Supabase real consome o rate limit de auth dele a cada push |
| Botões de exportar Excel/PDF sem handler | "Exportar para Excel" virou CSV (`lib/csv.ts` — ponto e vírgula como separador e BOM UTF-8, para abrir certo no Excel em pt-BR); "Exportar para PDF" é uma tela de impressão (`components/dashboard/TabelaImpressao.tsx` + `ImprimirAoAbrir`) que dispara `window.print()`. As rotas respeitam o mesmo filtro da listagem, com teto de 2000 linhas e aviso de truncamento. Site / Planta nasceu já com as duas |
| `console.error` sem correlação | `lib/log.ts`: cada log do middleware, `perfil-atual.ts` e das rotas de API carrega um id curto por requisição/invocação. O destino (mandar para um serviço externo) segue em aberto — linha própria na lista acima |
| Envs sem validação, erro genérico | `lib/env.ts`, com mensagem apontando o `.env.example`. A `service_role` fica de fora de propósito: é lida sob demanda em `lib/supabase/admin.ts`, para um projeto sem importação configurada continuar subindo |
| Sem testes nem CI | vitest + `.github/workflows/ci.yml` (lint, typecheck, teste, build) |
| Sem `error.tsx` | `app/dashboard/error.tsx` — o par em `app/` fechou junto (ver acima) |
| Sem `loading.tsx` | `app/dashboard/loading.tsx` |
| `.single()` vs `.maybeSingle()` | Layout passou a usar `maybeSingle`, com o motivo no comentário |
| Sem feedback de tentativas no login | Bloqueio de 30s após 5 falhas em `components/LoginForm.tsx` |

**Decisão de produto, não pendência:** a troca de senha não exige a senha atual
(commit `778c869`). O risco está descrito em `AUDITORIA-SEGURANCA.md` (A07) —
quem alcança uma sessão aberta troca a senha e tranca o dono para fora. A
mitigação seria o e-mail de aviso, que hoje não chega a ninguém porque o
remetente ainda é `onboarding@resend.dev` (`lib/resend.ts:29`), que só entrega
ao dono da conta Resend.

**O que nada nesta revisão pôde verificar:** nenhuma migration, policy ou
consulta desta rodada rodou contra um Postgres de verdade — não há Docker
neste ambiente para `supabase start`. Vale para a 0012, para o `seed.sql` e
para a rota de importação inteira, que passa 34 testes de formato e zero de
integração. `pnpm test:db` e um `curl` contra o ambiente local são o próximo
passo antes de confiar em qualquer um dos três.
