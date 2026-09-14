#!/usr/bin/env bash
# Conta as linhas de cada tabela de `public` e de `auth.users`, uma por linha,
# no formato `schema.tabela=N`, em ordem alfabetica.
#
# Usado pelo ensaio de restauracao (.github/workflows/ensaio-de-restauracao.yml)
# dos dois lados: producao e a copia restaurada. So nome de tabela e numero
# saem daqui -- o log do repositorio e publico.
#
# `\gexec` executa cada `select` que a primeira consulta gera: um `count(*)`
# por tabela, sem lista fixa -- tabela nova entra na conferencia sozinha.
set -euo pipefail

url="$1"

psql "$url" --no-psqlrc --quiet --tuples-only --no-align \
  --variable ON_ERROR_STOP=1 --variable VERBOSITY=sqlstate <<'SQL' | sed '/^$/d' | sort
select format('select %L || ''='' || count(*) from %I.%I', schemaname || '.' || tablename, schemaname, tablename)
  from pg_tables
 where schemaname = 'public'
    or (schemaname = 'auth' and tablename = 'users')
 order by schemaname, tablename
\gexec
SQL
