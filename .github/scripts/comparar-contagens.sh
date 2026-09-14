#!/usr/bin/env bash
# Confere a copia restaurada contra producao, tabela a tabela.
#
# Recebe tres arquivos de `contar-linhas.sh`: producao antes do dump, producao
# depois do dump e a copia restaurada. Producao continua recebendo escrita
# durante o dump, entao nao existe "o numero certo" -- existe a faixa
# [antes, depois] (ou [depois, antes], se houve exclusao). A tabela passa se a
# contagem restaurada cai dentro dela.
#
# Falha tambem quando uma tabela de producao NAO existe na copia: restauracao
# que perde tabela inteira e o pior caso, e um `count` ausente nao pode passar
# como zero.
set -euo pipefail

antes="$1"
depois="$2"
restaurado="$3"

falhas=0

while IFS='=' read -r tabela n_antes; do
  n_depois=$(grep -E "^${tabela//./\\.}=" "$depois" | cut -d= -f2 || true)
  n_rest=$(grep -E "^${tabela//./\\.}=" "$restaurado" | cut -d= -f2 || true)
  n_depois=${n_depois:-$n_antes}

  if [ -z "$n_rest" ]; then
    echo "FALTA  $tabela (producao: $n_antes, copia: tabela ausente)"
    falhas=$((falhas + 1))
    continue
  fi

  minimo=$(( n_antes < n_depois ? n_antes : n_depois ))
  maximo=$(( n_antes > n_depois ? n_antes : n_depois ))

  if [ "$n_rest" -lt "$minimo" ] || [ "$n_rest" -gt "$maximo" ]; then
    echo "DIFERE $tabela (producao: $minimo..$maximo, copia: $n_rest)"
    falhas=$((falhas + 1))
  else
    echo "ok     $tabela ($n_rest)"
  fi
done < "$antes"

if [ "$falhas" -gt 0 ]; then
  echo "::error::$falhas tabela(s) nao batem entre producao e a copia restaurada."
  exit 1
fi

echo "Todas as $(wc -l < "$antes") tabelas conferidas batem."
