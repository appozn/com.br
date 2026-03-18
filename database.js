const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'bunny-pay.db'));

// Criar tabelas
db.exec(`
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

    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        notif_limit INTEGER DEFAULT 10,
        notif_interval INTEGER DEFAULT 60,
        is_generator_on INTEGER DEFAULT 0
    );

    INSERT OR IGNORE INTO settings (id, notif_limit, notif_interval, is_generator_on) VALUES (1, 10, 60, 0);

    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL
    );
`);

// Produtos não são mais inseridos por padrão. Começa zerado.

module.exports = {
    // Notificações
    getAllNotifications: async () => db.prepare('SELECT * FROM notifications ORDER BY timestamp DESC').all(),

    createNotification: async (type, title, value, fee, net) => {
        const stmt = db.prepare('INSERT INTO notifications (type, title, value, fee, net, timestamp) VALUES (?, ?, ?, ?, ?, ?)');
        const result = stmt.run(type, title, value, fee, net, new Date().toISOString());
        return db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
    },

    markAsRead: async (id) => {
        db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
    },

    // Produtos
    getAllProducts: async () => db.prepare('SELECT * FROM products').all(),

    createProduct: async (id, name, value) => {
        const now = new Date().toISOString();
        db.prepare('INSERT INTO products (id, name, value, is_active, created_at) VALUES (?, ?, ?, 1, ?)').run(id, name, value, now);
        return { id, name, value, is_active: 1, created_at: now };
    },

    updateProductStatus: async (id, is_active) => {
        db.prepare('UPDATE products SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, id);
        return { id, is_active };
    },

    updateProduct: async (id, name, value) => {
        db.prepare('UPDATE products SET name = ?, value = ? WHERE id = ?').run(name, value, id);
        return { id, name, value };
    },

    // Configurações
    getSettings: async () => db.prepare('SELECT * FROM settings WHERE id = 1').get(),

    updateSettings: async (notif_limit, notif_interval, is_generator_on) => {
        db.prepare('UPDATE settings SET notif_limit = ?, notif_interval = ?, is_generator_on = ? WHERE id = 1')
            .run(notif_limit, notif_interval, is_generator_on ? 1 : 0);
        return { notif_limit, notif_interval, is_generator_on };
    },

    // Usuário
    getUser: async (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),

    createUser: async (email) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)');
        stmt.run(email);
        return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    }
};
