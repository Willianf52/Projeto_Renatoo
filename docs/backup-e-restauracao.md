# Backup e restauração do banco

P1-1 e P1-2 da auditoria de 11/09/2026. Decisões tomadas pelo dono do produto
em 13/09/2026. Este documento é a metade operacional que faltava em
`docs/lgpd-privacidade.md`: quanto se perde, em quanto tempo volta e quem
executa.

## A situação real, sem arredondar

- A organização do Supabase está no plano **Free**, e fica nele: **decisão de
  14/09/2026, o projeto não assina o Pro**. No Free, backup diário não é
  acessível pelo painel nem pela API — a documentação do Supabase manda
  projetos Free fazerem o próprio dump.
- Artifact do GitHub foi **recusado** como lugar de backup: o repositório é
  **público**, e artifact de repositório público pode ser baixado por qualquer
  conta do GitHub. O dump contém dado pessoal.
- **Decisão de 14/09/2026: o backup vai para um bucket privado no Cloudflare
  R2**, criptografado, uma vez por dia (`.github/workflows/backup-do-banco.yml`).
- O **ensaio** mensal (`ensaio-de-restauracao.yml`) prova que um dump desse
  formato restaura, mede o tempo e confere que o backup mais recente do R2
  decripta e está inteiro.

**Enquanto os secrets da seção "Configuração que falta" não existirem, os dois
workflows se pulam sozinhos e continua não existindo backup nenhum.**

| Medida | Valor (com os secrets configurados) | Por quê |
|---|---|---|
| **RPO** (quanto se perde) | **Até 24 horas** | Um backup por dia, às 06:00 de Brasília. |
| **Retenção** | 30 dias (regra de ciclo de vida do bucket) | Configurada no painel do Cloudflare, não no workflow — um bug no workflow não consegue apagar histórico. |
| **RTO** (em quanto tempo volta) | Medido a cada ensaio — ver o resumo do último run de *Ensaio de restauração* | Tempo de restaurar o dump num Postgres novo. Não inclui baixar o backup, criar projeto nem reapontar a aplicação (~30 min a mais). |
| **Quem executa** | Dono do projeto | Único com a senha do banco, a chave do backup e o acesso ao R2. |

### Custo

R2 no plano gratuito: 10 GB de armazenamento, 1 milhão de escritas e 10
milhões de leituras por mês, **sem cobrança de saída**. Um backup diário deste
banco fica na casa dos kB a poucos MB; com 30 dias de retenção, o uso fica
ordens de grandeza abaixo da cota.

O Cloudflare **pede um meio de pagamento para ativar o R2**, mesmo no gratuito.
Não há cobrança dentro da cota; a regra de retenção de 30 dias é o que garante
que o volume não cresça até ela.

### Saída de emergência (paga, e só em último caso)

A documentação do Supabase informa que projetos Free têm até 7 backups diários
guardados internamente, acessíveis só com upgrade para Pro (US$ 25/mês) — e
avisa que isso pode deixar de valer. Não faz parte do plano; fica registrado
só como o que existe tecnicamente se o R2 falhar junto com o banco.

## O backup diário (`.github/workflows/backup-do-banco.yml`)

1. `supabase db dump` de produção em três arquivos (roles, schema, dados) — o
   mesmo formato que o ensaio restaura.
2. Junta `contagem.txt` (linhas por tabela, para conferir uma restauração) e
   `manifesto.txt` (data, commit e última migration aplicada).
3. Empacota (`tar.gz`) e **criptografa com GPG simétrico, AES-256**, com a
   senha do secret `BACKUP_CHAVE`. O dump em claro é apagado do runner logo em
   seguida.
4. Envia para `banco/AAAA/MM/banco-AAAAMMDD-HHMMSS.tar.gz.gpg` no bucket e
   confere que o tamanho lá bate com o enviado.

Falha de backup agendado chega por e-mail do GitHub para o dono do repositório
(notificação padrão de workflow agendado que falha).

## Como restaurar um backup

Numa máquina com `aws` CLI, `gpg` e `psql`:

```bash
export AWS_ACCESS_KEY_ID=...        # token do R2 (leitura basta)
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=auto
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
R2="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"

# 1) Escolher o backup
aws s3 ls s3://<BUCKET>/banco/ --recursive --endpoint-url "$R2"
aws s3 cp s3://<BUCKET>/banco/2026/09/banco-....tar.gz.gpg . --endpoint-url "$R2"

# 2) Decriptar e abrir (pede a BACKUP_CHAVE)
gpg --decrypt banco-....tar.gz.gpg | tar -xzf -
cat backup/manifesto.txt

# 3) Restaurar num Postgres novo (projeto Supabase novo: connection string do
#    Session pooler dele). Mesmos dois ajustes que o ensaio faz:
sed -i -E 's/^(GRANT "postgres" TO "cli_login_postgres".*)$/-- \1/' backup/roles.sql
sed -i -E 's/^(ALTER .* OWNER TO "supabase_admin";)$/-- \1/' backup/schema.sql
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file backup/roles.sql --file backup/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file backup/data.sql \
  --dbname "<URL DO BANCO NOVO>"

# 4) Conferir contra backup/contagem.txt
bash .github/scripts/contar-linhas.sh "<URL DO BANCO NOVO>" | diff - backup/contagem.txt
```

Depois: reaplicar o que o dump não leva (seção "O que o ensaio não cobre"
abaixo) e trocar as env vars da Vercel e do app mobile para o projeto novo.

## O ensaio (`.github/workflows/ensaio-de-restauracao.yml`)

Roda **no dia 1 de cada mês**, sob demanda (*Actions → Ensaio de restauração →
Run workflow*) e em **todo PR que altera `supabase/migrations/`**.

1. Conta as linhas de cada tabela de `public` e de `auth.users` em produção.
2. `supabase db dump` em três arquivos (roles, schema, dados), como a
   documentação do Supabase manda.
3. Conta de novo (produção segue recebendo escrita durante o dump).
4. Sobe um Supabase **vazio** dentro do runner e restaura, **cronometrado**.
5. Confere: cada tabela da cópia precisa ficar entre a contagem de antes e a de
   depois. Tabela ausente reprova.
6. **Só em PR:** aplica, por cima da cópia, as migrations do PR que ainda não
   estão no histórico de produção. É o P1-1 — a migration roda contra dado real
   antes de rodar contra a operação.

7. **Fora de PR:** baixa o backup mais recente do R2, decripta com
   `BACKUP_CHAVE` e confere que os cinco arquivos estão lá e não vazios.

O dump do ensaio **nunca** sai do runner, e o log não mostra dado: o repositório é
público. Erros do `psql` saem só com o código (`VERBOSITY=sqlstate`), porque a
mensagem padrão carrega valor de linha.

### O que o ensaio e o backup não cobrem

- **Objetos do Storage** (fotos e assinaturas de checklist): o dump do banco só
  leva a linha que aponta para o arquivo, não o arquivo. Fica fora do backup no
  R2 também.
- **Triggers e policies em `auth` e `storage`**: o dump de schema do Supabase
  exclui esses schemas. Numa restauração real, o trigger `on_auth_user_created`
  (migration 0001) e as policies do bucket `checklists` (0042/0045) precisam ser
  reaplicados a partir das migrations.
- **Configuração da plataforma**: chaves de API, URL do projeto, SMTP, provedores
  de login. Um projeto novo tem chaves novas, e as env vars da Vercel e do app
  mobile precisam ser trocadas.

## Configuração que falta (uma vez)

Sem estes secrets, os dois workflows rodam e **se pulam sozinhos**, com um
aviso. Todos em *GitHub → Settings → Secrets and variables → Actions → New
repository secret*.

### 1. Banco de produção — `PRODUCAO_DB_URL`

1. No painel do Supabase: *Connect* → **Session pooler** → copiar a connection
   string. **Não** a conexão direta: o runner do GitHub não tem IPv6, e o host
   direto do Supabase só responde em IPv6.
2. Trocar `[YOUR-PASSWORD]` pela senha do banco (*Project Settings → Database*;
   se ninguém souber, resetar ali — a aplicação não usa essa senha, usa as
   chaves de API).
3. Salvar como **`PRODUCAO_DB_URL`**.

### 2. Bucket no Cloudflare R2

1. No painel do Cloudflare: *R2 Object Storage* → ativar (pede meio de
   pagamento; ver "Custo" acima) → *Create bucket*. Nome sugerido:
   `upservicos-backup`. Localização: automática. **Não** ligar acesso público.
2. No bucket: *Settings* → *Object lifecycle rules* → *Add rule* → prefixo
   `banco/`, **apagar objetos após 30 dias**.
3. *R2* → *Manage API tokens* → *Create API token*: permissão **Object Read &
   Write**, **só este bucket**. Anotar o *Access Key ID* e o *Secret Access
   Key* (aparecem uma vez só).
4. O *Account ID* aparece na página inicial do R2 (e no próprio endpoint
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).
5. Salvar os secrets: **`R2_ACCOUNT_ID`**, **`R2_BUCKET`**,
   **`R2_ACCESS_KEY_ID`** e **`R2_SECRET_ACCESS_KEY`**.

### 3. Chave de criptografia — `BACKUP_CHAVE`

1. Gerar uma senha longa e aleatória (ex.: `openssl rand -base64 48`, ou o
   gerador do gerenciador de senhas).
2. Salvar como **`BACKUP_CHAVE`**.
3. **Guardar a mesma senha fora do GitHub** (gerenciador de senhas). Secret do
   GitHub não pode ser lido de volta: se ele for apagado e a senha não estiver
   em outro lugar, **todos os backups ficam ilegíveis para sempre**.

### 4. Primeira execução

1. *Actions → Backup do banco → Run workflow* e conferir no resumo o objeto
   criado no R2.
2. *Actions → Ensaio de restauração → Run workflow* e conferir que o passo
   "Backup mais recente do R2 abre?" passou.

O secret dá acesso de leitura **e escrita** ao banco inteiro. Em repositório
público ele continua protegido (secret não aparece em log nem vai para PR de
fork), mas quem tem permissão de escrita no repositório consegue usá-lo num
workflow. Hoje isso é só o dono do projeto.

## P1-1: por que não há projeto de staging

Um segundo projeto Free custaria US$ 0, mas ocupa a última vaga de projeto
ativo da organização e pausa sozinho após 7 dias sem uso. A decisão foi **não
criar agora**. O objetivo do item — testar migration contra dado real antes de
produção — ficou coberto pelo passo 6 do ensaio, sem projeto novo e sem copiar
dado pessoal para fora do runner.

Continua sem existir um ambiente de staging **para a aplicação** (uma URL onde
testar o painel contra dado de verdade). Se isso for necessário, a decisão de
criar o projeto volta à mesa.
