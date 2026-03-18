-- SQL de Sincronização Bunny Pay
-- Execute este código para corrigir ou criar o banco de dados manualmente

-- 1. Criar Tabela de Notificações
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    value REAL NOT NULL,
    fee REAL NOT NULL,
    net REAL NOT NULL,
    timestamp TEXT NOT NULL,
    read INTEGER DEFAULT 0
);

-- 2. Criar Tabela de Produtos
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    value REAL NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 3. Criar Tabela de Configurações
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    notif_limit INTEGER DEFAULT 10,
    notif_interval INTEGER DEFAULT 60,
    is_generator_on INTEGER DEFAULT 0,
    custom_gen TEXT DEFAULT '{"active":false,"count":30,"interval":10,"productIds":[]}'
);

-- 4. Criar Tabela de Usuários
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL
);

-- 5. Inserir Configuração Padrão
INSERT OR IGNORE INTO settings (id, notif_limit, notif_interval, is_generator_on, custom_gen) 
VALUES (1, 10, 60, 0, '{"active":false,"count":30,"interval":10,"productIds":[]}');

-- 6. Garantir Coluna custom_gen se já existir a tabela
-- (Este passo é manual se o Banco de Dados já existir)
-- ALTER TABLE settings ADD COLUMN custom_gen TEXT DEFAULT '{"active":false,"count":30,"interval":10,"productIds":[]}';
