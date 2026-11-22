#!/bin/sh
set -eu

for database in n8n evolution; do
  exists="$(psql --username "$POSTGRES_USER" --dbname postgres --tuples-only --no-align \
    --command "SELECT 1 FROM pg_database WHERE datname = '$database'")"
  if [ "$exists" != "1" ]; then
    psql --username "$POSTGRES_USER" --dbname postgres \
      --set ON_ERROR_STOP=1 --command "CREATE DATABASE \"$database\""
  fi
done
