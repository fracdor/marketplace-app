-- supabase/migrations/20260702000000_enable_extensions.sql
create extension if not exists pgtap schema extensions;
create extension if not exists pgcrypto schema extensions;
