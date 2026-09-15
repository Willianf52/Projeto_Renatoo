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
| Coordenadas de leitura, horário de visita | `leituras`, `visitas` | Indiretamente ligado ao operador que fez a coleta |
| Nome/e-mail de contato de cliente | `grupos_sites_clientes` (via `profiles` de nível CLIENTE) | Contato de cliente/holding |
| Login e telas abertas no painel (rota e **nomes** dos filtros, nunca os valores), com cargo | `eventos_de_uso` (migration 0051) | Usuários do sistema. Leitura só por quem vê a operação inteira |

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

1. Canal definido para receber o pedido (e-mail, formulário) — hoje não existe.
2. Prazo de resposta (LGPD: até 15 dias, prorrogável).
3. Quem no time tem acesso ao Supabase para executar o pedido (consulta/
   exclusão via SQL Editor ou painel de Authentication).

Não é código — é decidir o canal e documentar o passo a passo antes de
precisar dele pela primeira vez sob pressão de prazo legal.

## Terceiros que processam dado pessoal

| Serviço | O que processa | Contrato/DPA verificado? |
|---|---|---|
| Supabase | Todo o banco (dados de usuário, leituras, visitas) + Auth | A confirmar — checar Data Processing Agreement da Supabase Inc. |
| Resend | E-mail transacional (hoje: recuperação de senha) — recebe endereço de e-mail do destinatário | A confirmar |
| Sentry | Erros de aplicação — hoje inerte (sem DSN configurado). Quando ativado, avaliar se `sendDefaultPii` deve continuar desligado (está, por padrão do SDK) para não capturar IP/dado de usuário nos eventos de erro | A confirmar quando for ativado |

Ação: confirmar com cada fornecedor se o DPA padrão deles (geralmente
disponível nos Termos de Serviço/Trust Center) cobre o que a LGPD exige para
operador de dados, e guardar o link/documento em local acessível ao time
jurídico.

## Log de auditoria de acesso/alteração a dado de outro usuário

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
- [ ] Canal de atendimento a pedido de titular definido e documentado
- [ ] DPA confirmado com Supabase, Resend e (quando ativado) Sentry
- [ ] Audit trail de acesso a dado de outro usuário desenhado e priorizado
- [ ] Este documento revisado a cada tabela nova que armazene dado pessoal
