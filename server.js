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
app.get('/api/notifications', async (req, res) => {
    try {
        res.json(await db.getAllNotifications());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/notifications', async (req, res) => {
    try {
        const { type, value } = req.body;
        const isWithdraw = type === 'withdraw';
        const gross = parseFloat(value);
        const fee = isWithdraw ? 0 : (gross * 0.0599) + 2.49;
        const net = isWithdraw ? -gross : gross - fee;
        const title = isWithdraw ? 'Saque Realizado!' : (type === 'pix' ? 'Pix Gerado!' : 'Venda Aprovada!');

        const notification = await db.createNotification(type, title, gross, fee, net);

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
        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await db.createUser(email);
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// HTTP Server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════╗');
    console.log('║     OZN PAY - Servidor Iniciado       ║');
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
                products: await db.getAllProducts()
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
