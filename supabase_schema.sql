-- Arquivo de esquema do Supabase - Copie e cole no SQL Editor do seu dashboard Supabase

-- 1. Criação das tabelas
CREATE TABLE IF NOT EXISTS public.notifications (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    value REAL NOT NULL,
    fee REAL NOT NULL,
    net REAL NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    value REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS public.users (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    email TEXT UNIQUE NOT NULL
);

-- 2. Inserir produtos padrão
INSERT INTO public.products (id, name, value) 
VALUES 
    ('OZN-9XJ2', 'Licença Enterprise', 1499.90),
    ('OZN-4K82', 'Dashboard Pro', 497.00)
ON CONFLICT (id) DO NOTHING;

-- 3. Configuração de RLS (Row Level Security)
-- Habilita a segurança em nível de linha, recomendada pelo Supabase
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Exemplo: Permitir acesso anônimo total (Apenas para desenvolvimento/migração inicial)
-- IMPORTANTE: No futuro, configure políticas de RLS adequadas para produção.
CREATE POLICY "Enable all ops for all users" ON public.notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all ops for all users" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all ops for all users" ON public.users FOR ALL USING (true) WITH CHECK (true);
