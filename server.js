const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API Routes
app.get('/api/info', (req, res) => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const ips = [];
    Object.keys(interfaces).forEach(name => {
        interfaces[name].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
        });
    });
    res.json({ ips });
});

app.get('/api/notifications', async (req, res) => {
    try {
        res.json(await db.getAllNotifications());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/notifications', async (req, res) => {
    try {
        const { type, value, timestamp } = req.body;
        const isWithdraw = type === 'withdraw';
        const gross = parseFloat(value);
        const fee = isWithdraw ? 0 : (gross * 0.0599) + 2.49;
        const net = isWithdraw ? -gross : gross - fee;
        const title = isWithdraw ? 'Saque Realizado!' : (type === 'pix' ? 'Pix Gerado!' : 'Venda Aprovada!');

        const notification = await db.createNotification(type, title, gross, fee, net, timestamp);

        // Broadcast para todos os clientes WebSocket
        wss.clients.forEach(client => {
            if (client.readyState === 1) { // OPEN
                client.send(JSON.stringify({
                    event: 'new_notification',
                    data: notification
                }));
            }
        });

        res.json(notification);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        res.json(await db.getAllProducts());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { id, name, value } = req.body;
        const product = await db.createProduct(id, name, parseFloat(value));
        broadcastState(); // Sync all admins
        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
        broadcastState();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { name, value, is_active } = req.body;
        if (name !== undefined && value !== undefined) {
             await db.updateProduct(req.params.id, name, parseFloat(value));
        }
        if (is_active !== undefined) {
            await db.updateProductStatus(req.params.id, is_active);
        }
        
        // Broadcast atualizado
        broadcastState();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        res.json(await db.getSettings());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const { notif_limit, notif_interval, is_generator_on, custom_gen } = req.body;
        const settings = await db.updateSettings(notif_limit, notif_interval, is_generator_on, custom_gen);
        broadcastState();
        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

async function broadcastState() {
    const data = {
        notifications: await db.getAllNotifications(),
        products: await db.getAllProducts(),
        settings: await db.getSettings()
    };
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({
                event: 'connected',
                data: data
            }));
        }
    });
}

app.post('/api/login', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await db.createUser(email);
        broadcastState();
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// HTTP Server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════╗');
    console.log('║    Bunny Pay - Servidor Iniciado      ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    console.log(`🌐 Acesse no computador: http://localhost:${PORT}`);
    console.log('');
    console.log('📱 Acesse no celular:');

    // Mostrar IPs locais
    const os = require('os');
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach(name => {
        interfaces[name].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`   http://${iface.address}:${PORT}`);
            }
        });
    });

    console.log('');
    console.log('✅ Banco de dados SQLite conectado');
    try {
        // Migração forçada para garantir sincronia com as novas regras
        db.prepare("UPDATE products SET is_active = 1 WHERE is_active = 0").run();
        
        // Verificar se custom_gen existe, se não, adicionar
        try {
            db.prepare("SELECT custom_gen FROM settings LIMIT 1").get();
        } catch (e) {
            db.prepare("ALTER TABLE settings ADD COLUMN custom_gen TEXT DEFAULT '{\"active\":false,\"count\":30,\"interval\":10,\"productIds\":[]}'").run();
            console.log('✅ Coluna custom_gen adicionada com sucesso');
        }

        console.log('✅ Banco de dados sincronizado com sucesso');
    } catch(e) { 
        console.log('⚠️ Aviso na inicialização do DB:', e.message); 
    }
    console.log('✅ WebSocket ativo (sincronização em tempo real)');
    console.log('');
    console.log('Pressione Ctrl+C para parar o servidor');
    console.log('════════════════════════════════════════');
});

// WebSocket Server
const wss = new WebSocketServer({ server });

// Keep-Alive mechanism (Heartbeat) - EVITA DESCONEXÃO
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', async (ws) => {
    console.log('✅ Novo dispositivo conectado');
    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);

    // Enviar estado inicial
    try {
        ws.send(JSON.stringify({
            event: 'connected',
            data: {
                notifications: await db.getAllNotifications(),
                products: await db.getAllProducts(),
                settings: await db.getSettings()
            }
        }));
    } catch (e) {
        console.error('Erro ao enviar estado inicial:', e);
    }

    ws.on('close', () => {
        console.log('❌ Dispositivo desconectado');
    });

    ws.on('error', (e) => console.error('WebSocket erro cliente:', e));
});

wss.on('close', () => clearInterval(interval));

module.exports = { app, server, wss };
