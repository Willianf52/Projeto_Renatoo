-- ============================================================================
-- VeloxLab — Fecha tipo e tamanho aceitos no bucket `checklists`
--
-- Achado da revisao de seguranca de 2026-09-04.
--
-- A 0042 criou o bucket declarando so `id`, `name` e `public`, entao
-- `file_size_limit` e `allowed_mime_types` ficaram NULL -- no Storage isso
-- significa "qualquer tamanho, qualquer tipo".
--
-- As policies da 0042/0045 respondem "QUEM grava ONDE" (so INSPETOR, so na
-- pasta da propria visita, sem UPDATE nem DELETE). Elas nao respondem "O QUE".
-- O `contentType` viaja como argumento do cliente em `envio-de-checklist.ts`,
-- entao quem tem token de inspetor e monta a chamada por fora do app grava
-- `text/html` na pasta da propria visita e passa por todas elas -- e o Storage
-- devolve com o content-type declarado, rodando no origin do Supabase quando o
-- GESTOR abre a URL assinada.
--
-- O allowlist tem exatamente os dois tipos que o app produz. `image/svg+xml`
-- fica DE FORA de proposito: SVG e XML e carrega <script>.
--
-- 10 MiB por objeto: foto de camera a `quality: 0.6` fica entre 1 e 3 MB nos
-- aparelhos de hoje.
--
-- Idempotente: `update` sobre a linha que a 0042 ja garante existir.
-- ============================================================================

update storage.buckets
set
  file_size_limit = 10485760, -- 10 MiB
  allowed_mime_types = array['image/png', 'image/jpeg']
where id = 'checklists';
