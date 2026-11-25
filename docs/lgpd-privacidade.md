# LGPD e Privacidade — Projeto_Renatoo

> Este documento cobre o que é **processo**, não código. A base técnica (RLS
> por papel/escopo de cliente, mensagens de erro genéricas, PII não vazando
> em over-fetch) já está tratada e verificada em `docs/auditoria-seguranca.md`.
> Aqui entra o que precisa existir por escrito e ser decidido por quem responde
> juridicamente pelo produto — não é algo que se resolve só com uma migration.

## Dados pessoais tratados pelo sistema

| Dado | Onde vive | Titular |
|---|---|---|
| Nome completo, e-mail, cargo | `profiles` | Usuários do sistema (operadores, gestores, clientes) |
| Coordenadas de leitura, horário de visita | `leituras`, `visitas`. Desde a 0088 cada leitura do app guarda latitude, longitude e precisão do aparelho, **só no momento da leitura** e só com a permissão de localização em uso (sem ela, a leitura entra sem posição). Não há rastreio em segundo plano | Indiretamente ligado ao operador que fez a coleta |
| Km do veículo e manutenções | `veiculo_km`, `veiculo_manutencoes` (0104), `maquina_manutencoes` (0111), sempre com `registrado_por` e a hora; `veiculos.usuario_id` diz de quem é o carro | Usuários da UP (e o CLIENTE, só na manutenção de máquina do seu escopo) |
| Clientes que cada pessoa atende | `clientes_atendidos` (0113) | Usuários da UP. Cadastro e consulta, não muda o acesso |
| Avisos recebidos | `notificacoes` (0103): título e texto do aviso por pessoa; expurgo de lidas em 90 dias e de qualquer uma em 180 | Usuários do sistema. Cada um vê só os próprios |
| Nome/e-mail de contato de cliente | `grupos_sites_clientes` (via `profiles` de nível CLIENTE) | Contato de cliente/holding |
| Login e telas abertas no painel (rota e **nomes** dos filtros, nunca os valores), com cargo | `eventos_de_uso` (migration 0051) | Usuários do sistema. Leitura só por quem vê a operação inteira |
| Foto do usuário | Bucket **privado** `fotos-de-usuario` (`<id>/foto`) e `fotos_de_usuario` (migration 0112) | Usuários do sistema. Vê e troca só a própria pessoa e o GESTOR; a tela recebe link assinado de 1 hora. JPG, PNG ou WebP até 2 MB. Removida pela própria pessoa ou pelo GESTOR a qualquer momento; sai junto com a conta |
| Endereço de push do celular e quem está logado nele | `dispositivos_push` (migration 0110) | Usuários do app. Cada um vê só os próprios; apagado ao sair do app |

Não há coleta de dado sensível (saúde, biometria, origem racial, opinião
política) no schema atual — vale reconfirmar isso a cada tabela nova antes de
criar a migration, porque dado sensível muda a base legal exigida.

## Retenção de dados

### Telemetria de uso: 12 meses — decidido em 15/09/2026

**Decisão do dono do produto:** `eventos_de_uso` (login e tela aberta, 0051)
guarda **12 meses**. O prazo cobre a comparação de um mês contra o mesmo mês
do ano anterior — que, num sistema de rondas mensais, é a pergunta que a
telemetria existe para responder — e é curto o bastante para não virar achado
numa auditoria de LGPD, já que é dado de uso, não de operação.

**Implementado na migration 0052**, e não só escrito aqui:
`manutencao.expurgar_eventos_de_uso()` apaga o que passou do prazo e devolve
quantas linhas apagou; o `pg_cron` a dispara todo dia às **06:30 UTC**
(03:30 de Brasília), meia hora depois do backup diário — de propósito, para o
backup do dia guardar o estado antes do expurgo. A função mora no schema
`manutencao`, fora da API e sem `usage` para `anon`/`authenticated`. O prazo é
argumento com padrão, então mudá-lo é uma migration de uma linha. Regras
cobertas em `supabase/tests/database/retencao_de_eventos_de_uso_test.sql`.

### Operação (`leituras`, `visitas`): ainda pendente de decisão

Continuam sem rotina de expurgo — crescem indefinidamente. É deliberado que a
decisão não tenha sido tomada junto com a da telemetria: são dado de operação,
com contestação de cliente e obrigação contratual no meio, e não se decidem
pelo mesmo argumento. Antes de definir um prazo, confirmar:

- Por quanto tempo o negócio realmente precisa consultar uma leitura antiga
  (auditoria interna, contestação de cliente, obrigação contratual)?
- Existe exigência contratual com os clientes que force reter (ou apagar) por
  um prazo específico?

Uma vez definido, a implementação é o mesmo caminho da 0052: uma função em
`manutencao` e um agendamento no `pg_cron`. O que muda é o cuidado — apagar
leitura antiga é apagar prova de ronda feita, então aqui cabe arquivar antes
de apagar. Não implementar sem essa decisão primeiro.

## Atendimento a pedido de titular (acesso, correção, exclusão)

Hoje é **manual, via painel do Supabase** — não há tela nem processo
documentado para um usuário pedir os próprios dados ou solicitar exclusão.
Para um sistema deste porte (times internos, sem cadastro público de usuário
final), isso costuma ser aceitável desde que exista um procedimento mínimo:

1. Canal definido para receber o pedido: **o "Suporte" do portal** (link de WhatsApp em
   `NEXT_PUBLIC_URL_SUPORTE`), decidido em 26/10/2026 e publicado na política
   pública `/privacidade`. Controlador: Up Serviços Especializados (CNPJ ainda
   a incluir na página).
2. Prazo de resposta (LGPD: até 15 dias, prorrogável).
3. Quem no time tem acesso ao Supabase para executar o pedido (consulta/
   exclusão via SQL Editor ou painel de Authentication).

Não é código — é decidir o canal e documentar o passo a passo antes de
precisar dele pela primeira vez sob pressão de prazo legal.

## Terceiros que processam dado pessoal

| Serviço | O que processa | Contrato/DPA verificado? |
|---|---|---|
| Supabase | Todo o banco (dados de usuário, leituras, visitas) + Auth | A confirmar — checar Data Processing Agreement da Supabase Inc. |
| Expo (push) e Google Firebase Cloud Messaging | Notificação no celular (0110): recebem o endereço de push do aparelho, o título e o texto do aviso (ex.: "Revisão do veículo ABC-1D23"). Sem nome, e-mail nem dado de inspeção. O projeto do Firebase tem o Analytics ligado, mas o app não tem o pacote do Analytics: nenhum dado de uso vai para o Google | A confirmar |
| Resend | E-mail transacional: recuperação e troca de senha, ocorrência aberta e o aviso de inspeção realizada (com o PDF do checklist, que leva nomes, respostas e fotos) aos gestores da lista — recebe o endereço do destinatário e o conteúdo | A confirmar |
| Sentry | Erros de aplicação, no portal e no app. **Correção de registro (16/09/2026):** esta linha dizia que `sendDefaultPii` estava desligado "por padrão do SDK", o que não valia no painel web: o `dataCollection: {}` gerado pelo wizard fazia o SDK ignorar `sendDefaultPii` e coletar corpo de requisição (inclusive senha em texto puro), cookies e dados do usuário. Desde então as três inicializações usam `src/lib/sentry-privacidade.ts` — sem corpo, cookie, usuário, consulta ao banco nem cabeçalho de credencial, com `beforeSend` removendo corpo como segunda barreira — travado em `sentry-privacidade.test.ts`. O que sai é stack trace, rota e mensagem de erro. Dado hospedado na UE: transferência internacional | A confirmar quando for ativado |

Ação: confirmar com cada fornecedor se o DPA padrão deles (geralmente
disponível nos Termos de Serviço/Trust Center) cobre o que a LGPD exige para
operador de dados, e guardar o link/documento em local acessível ao time
jurídico.

## Log de auditoria de acesso/alteração a dado de outro usuário

**Atualização (25/11/2026):** a parte de **alteração** já existe. A tabela
`auditoria` (0034, ampliada na 0070) grava quem mudou o quê, quando e os
valores antes e depois, por gatilho, e só a gestão lê. O que segue em aberto
abaixo é a **leitura** ("quem viu o cadastro de X").

Hoje existe log técnico (`apps/web/src/lib/log.ts`, correlacionado por id de
requisição) para depuração — mas não um **audit trail de negócio**
pesquisável do tipo "quem viu/alterou o cadastro do usuário X, quando".

Isso é uma feature própria (tabela `audit_log`, decisão de quais ações
registrar, quem pode consultar, por quanto tempo reter o próprio log), não
uma correção pontual — fica registrado aqui como próximo passo a **desenhar**
com calma (schema, RLS do próprio log, custo de escrita extra por ação
sensível) em vez de implementar sem essa conversa. Candidatas naturais para
cobrir primeiro: leitura/alteração de `profiles` de outro usuário e qualquer
ação em `usuarios/actions.ts` (que já roda com `service_role`, fora do RLS).

## Checklist rápido para revisão periódica

- [x] Prazo de retenção de `eventos_de_uso` definido (12 meses) e implementado
      (migration 0052, `pg_cron` às 06:30 UTC)
- [ ] Prazo de retenção de `leituras`/`visitas` definido e implementado
- [x] Canal de atendimento a pedido de titular definido (Suporte do portal,
      26/10/2026) e publicado em `/privacidade`; falta o passo a passo interno
- [x] Política de privacidade pública (`apps/web/src/app/privacidade`), exigida
      pelas lojas de app
- [ ] DPA confirmado com Supabase, Resend e (quando ativado) Sentry
- [x] Audit trail de alteração (`auditoria`, 0034/0070)
- [ ] Audit trail de leitura de dado de outro usuário desenhado e priorizado
- [x] Política pública revista em 25/11/2026 (localização na leitura, foto,
      km, notificações, Firebase)
- [x] Termos de Uso (`/termos`) e Política de Cookies (`/cookies`) públicos
      desde 25/11/2026; o portal só usa cookies e armazenamento necessários,
      então não pede consentimento
- [ ] Termos de Uso revisados por advogado
- [ ] CNPJ do controlador nas páginas legais
- [ ] Este documento revisado a cada tabela nova que armazene dado pessoal
