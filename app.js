// Bunny Pay - Platform Engine v5.7
if (!localStorage.getItem('bunny_wiped_v57')) {
    localStorage.clear();
    localStorage.setItem('bunny_wiped_v57', 'true');
}
window.onerror = function (msg, url, line, col, error) {
    alert(`ERRO CRÍTICO DO SISTEMA:\n${msg}\nLinha: ${line}`);
    return false;
};

// Configuração Inteligente do Backend
let BACKEND_URL = 'http://localhost:3000'; // Default

if (window.location.hostname && window.location.hostname !== '') {
    BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000'
        : `http://${window.location.hostname}:3000`;
}

if (location.protocol === 'file:') {
    BACKEND_URL = 'http://localhost:3000';
}

const WS_URL = BACKEND_URL.replace('http', 'ws');

let ws = null;
let reconnectTimeout = null;

// Conectar ao WebSocket silenciosamente
function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    try {
        ws = new WebSocket(WS_URL);
    } catch(e) {
        console.warn('WebSocket indisponível, modo offline ativo.');
        return;
    }

    ws.onopen = () => {
        console.log('✅ Conectado ao servidor');
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);

            if (message.event === 'connected') {
                if (message.data.notifications) State.notifications = message.data.notifications;
                if (message.data.products) State.products = message.data.products;
                if (message.data.settings) {
                    // Preserve local custom_gen — server DB doesn't store it
                    const savedCustomGen = State.settings.custom_gen;
                    State.settings = { ...message.data.settings, custom_gen: savedCustomGen || State.settings.custom_gen };
                    State.startGenerator();
                }
                State.saveLocal();
                UI.render();
            }

            if (message.event === 'new_notification') {
                State.notifications.unshift(message.data);
                State.saveLocal();
                System.trigger(message.data);
                UI.render();
            }
        } catch (e) {
            console.error('Erro ao processar mensagem:', e);
        }
    };

    ws.onclose = () => {
        console.log('Servidor offline. Modo local ativo.');
        ws = null;
        reconnectTimeout = setTimeout(connectWebSocket, 10000); // Tenta silenciosamente a cada 10s
    };

    ws.onerror = (error) => {
        console.warn('WebSocket erro (silenciado)');
        ws?.close();
    };
}

function showConnectionStatus(msg, color) {
    let status = document.getElementById('connection-status');
    if (!status) {
        status = document.createElement('div');
        status.id = 'connection-status';
        status.style.cssText = `position:fixed;top:10px;right:10px;background:${color};color:#000;padding:8px 16px;border-radius:20px;z-index:10000;font-weight:bold;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,0.3)`;
        document.body.appendChild(status);
    }
    status.textContent = msg;
    status.style.background = color;
}

// Tentar conectar silenciosamente (sem banner visível)
if (location.protocol !== 'file:') {
    connectWebSocket();
}

const State = {
    user: JSON.parse(localStorage.getItem('bunny_user')) || null,
    products: JSON.parse(localStorage.getItem('bunny_products')) || [],
    notifications: JSON.parse(localStorage.getItem('bunny_notifications')) || [],
    settings: JSON.parse(localStorage.getItem('bunny_settings')) || { notif_limit: 999999, notif_interval: 1, is_generator_on: 1, custom_gen: { active: false, count: 30, interval: 10, productIds: [] } },

    currentView: 'dashboard',
    isLocked: false,
    genTimer: null,
    isPC: window.innerWidth > 680,

    _lastGens: {},

    async notify(type, value, customTimestamp = null) {
        const isWithdraw = type === 'withdraw';
        const gross = parseFloat(parseFloat(value).toFixed(2));
        const fee = isWithdraw ? 0 : parseFloat(((gross * 0.0599) + 2.49).toFixed(2));
        const net = isWithdraw ? -gross : parseFloat((gross - fee).toFixed(2));
        const title = isWithdraw ? 'Saque Realizado!' : (type === 'pix' ? 'Pix Gerado!' : 'Venda Aprovada!');
        
        // Ajuste para Brasília (UTC-3)
        const now = new Date();
        const offset = -3; // Brasília
        const brTime = new Date(now.getTime() + (offset * 3600000));
        const timestamp = customTimestamp || (new Date(brTime.getTime())).toISOString();
        
        // Emulando tempo de resposta rápido
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 150);
            fetch(`${BACKEND_URL}/api/notifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, value, timestamp }),
                signal: controller.signal
            }).catch(() => {}); // Fogo rápido
            clearTimeout(timeoutId);
        } catch (e) {}

        const notif = {
            id: Date.now() + Math.random(), type, title: title, value: gross, fee, net, timestamp, read: false
        };
        this.notifications.unshift(notif);
        this.saveLocal();
        System.trigger(notif);
        UI.render();
    },

    async fetchAll() {
        try {
            const [p, n, s] = await Promise.all([
                fetch(`${BACKEND_URL}/api/products`).then(r => r.json()),
                fetch(`${BACKEND_URL}/api/notifications`).then(r => r.json()),
                fetch(`${BACKEND_URL}/api/settings`).then(r => r.json())
            ]);
            this.products = p;
            this.notifications = n;
            // Preserve local custom_gen — server DB doesn't store it
            const savedCustomGen = this.settings.custom_gen;
            this.settings = { ...s, custom_gen: savedCustomGen || this.settings.custom_gen };
            this.saveLocal();
            UI.render();
            // this.startGenerator(); // DESATIVADO: O servidor agora gerencia o gerador em background
        } catch (e) { console.warn('Fetch sync falhou (Offline)'); }
    },

    async addProduct(name, value) {
        const id = 'OZN-' + Math.random().toString(36).substr(2, 4).toUpperCase();
        const product = { id, name, value: parseFloat(value), is_active: 1 };

        try {
            const response = await fetch(`${BACKEND_URL}/api/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(product)
            });
            if (response.ok) return;
        } catch (e) { console.warn('Erro ao salvar produto'); }
        
        this.products.unshift(product);
        this.saveLocal();
        UI.render();
    },

    saveLocal() {
        localStorage.setItem('bunny_products', JSON.stringify(this.products));
        localStorage.setItem('bunny_notifications', JSON.stringify(this.notifications));
        localStorage.setItem('bunny_settings', JSON.stringify(this.settings));
    },

    async startGenerator() {
        if (this.genTimer) clearTimeout(this.genTimer);
        if (this._saleTimers) this._saleTimers.forEach(t => clearTimeout(t));
        this._saleTimers = [];
        this._isCycling = false;

        const runCycle = () => {
            const config = this.settings.custom_gen || { active: false };
            if (!config.active) {
                this._isCycling = false;
                return;
            }

            // Always re-read products fresh (picks up newly added ones!)
            const activeProds = this.products.filter(p => {
                if (config.productIds && config.productIds.length > 0) {
                    return config.productIds.includes(p.id);
                }
                return p.is_active !== 0;
            });

            if (activeProds.length === 0) {
                this.genTimer = setTimeout(runCycle, 5000);
                return;
            }

            // Pick a RANDOM product each cycle
            const p = activeProds[Math.floor(Math.random() * activeProds.length)];

            // 1. Pix Gerado
            this.notify('pix', p.value);

            // 2. Venda aprovada após 19 segundos
            const saleTimer = setTimeout(() => {
                if (this.settings.custom_gen?.active) {
                    this.notify('sale', p.value);
                }
            }, 19000);
            this._saleTimers.push(saleTimer);

            // 3. Próximo ciclo após 24 segundos (19s + 5s de pausa)
            this.genTimer = setTimeout(runCycle, 24000);
        };

        if (!this._isCycling) {
            // this._isCycling = true;
            // this.genTimer = setTimeout(runCycle, 5000); // Começa em 5s
        }
    }
};

const System = {
    audio: new Audio('https://assets.mixkit.co/active_storage/sfx/3005/3005-preview.mp3'),

    trigger(notif) {
        this.playAlert();
        this.vibrate();
        this.sendPush(notif);
        if (State.isLocked) UI.render();
    },

    playAlert() {
        try {
            const clone = this.audio.cloneNode();
            clone.volume = 0.6;
            clone.play().catch(() => {});
        } catch (e) {}
    },

    vibrate() {
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
    },

    showBanner(notif) {
        const overlay = document.getElementById('notification-overlay');
        const b = document.createElement('div');
        b.className = 'push-banner animate-enter';

        b.innerHTML = `
            <div class="push-icon"><i data-lucide="${notif.type === 'pix' ? 'qr-code' : 'zap'}"></i></div>
            <div class="push-content">
                <h5>${notif.title}</h5>
                <p><b>${notif.title}</b><br>Valor: R$ ${Number(notif.net || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
        `;
        overlay.prepend(b);
        if (window.lucide) lucide.createIcons({ scope: b });
        setTimeout(() => b.remove(), 5000);
    },

    sendPush(notif) {
        const amount = Math.abs(Number(notif.net || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (window.swRegistration && Notification.permission === "granted") {
            try {
                window.swRegistration.showNotification(notif.title, {
                    body: `Valor: R$ ${amount}`,
                    icon: 'logo.png?v=10',
                    badge: 'logo.png?v=10',
                    vibrate: [200, 100, 200],
                    tag: 'ozn-sale',
                    requireInteraction: true
                });
                return;
            } catch (e) { console.warn('SW falhou'); }
        }

        if (Notification.permission === "granted") {
            try {
                new Notification(notif.title, {
                    body: `Valor: R$ ${amount}`,
                    icon: 'logo.png'
                });
            } catch (e) { console.error("Notificação nativa falhou", e); }
        }
    },

    askPermission() {
        if (!("Notification" in window)) return alert("Navegador não suporta notificações.");

        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                UI.showToast("Notificações Ativadas! 🔔");
                if ('serviceWorker' in navigator && !window.swRegistration) {
                    navigator.serviceWorker.register('sw.js').then(reg => window.swRegistration = reg);
                }
                this.sendPush({ title: "Sistema Online", net: 0, type: 'sale' });
            }
        });
    }
};

const UI = {
    showToast(msg) {
        const t = document.getElementById('status-toast-layer');
        if (!t) return;
        const el = document.createElement('div');
        el.className = 'push-banner animate-enter';
        el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:10001;max-width:400px';
        el.innerHTML = `<div class="push-content"><p style="text-align:center">${msg}</p></div>`;
        t.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    },

    render() {
        const app = document.getElementById('app');
        const lock = document.getElementById('lock-screen');
        if (!app) return;

        if (State.isLocked) {
            app.style.display = 'none';
            lock.style.display = 'flex';
            return this.renderLock();
        }

        app.style.display = State.isPC ? 'flex' : 'block';
        lock.style.display = 'none';

        if (!State.user) return app.innerHTML = this.views.login();

        if (State.isPC) {
            document.body.classList.add('pc-mode');
            this.renderPC(app);
        } else {
            document.body.classList.remove('pc-mode');
            this.renderMobile(app);
        }

        if (window.lucide) lucide.createIcons();
    },

    renderMobile(app) {
        app.innerHTML = `
            ${this.views[State.currentView] ? this.views[State.currentView]() : this.views.dashboard()}
            ${this.components.nav()}
        `;
    },

    renderPC(app) {
        app.innerHTML = `
            <aside class="pc-sidebar">
                <div class="sidebar-header" style="display:flex; justify-content:center">
                    <img src="logo.png?v=10" alt="Bunny Pay" style="width:100px; height:100px; object-fit:contain">
                </div>
                <nav class="sidebar-nav">
                    <a href="javascript:UI.navigate('dashboard')" class="nav-item-pc ${State.currentView === 'dashboard' ? 'active' : ''}">
                        <i data-lucide="layout-grid"></i><span>Dashboard</span>
                    </a>
                    <a href="javascript:UI.navigate('products')" class="nav-item-pc ${State.currentView === 'products' ? 'active' : ''}">
                        <i data-lucide="package"></i><span>Painel de Gerenciamento</span>
                    </a>
                    <a href="javascript:UI.navigate('notifications')" class="nav-item-pc ${State.currentView === 'notifications' ? 'active' : ''}">
                        <i data-lucide="bell"></i><span>Notificações</span>
                    </a>
                    <a href="javascript:UI.navigate('settings')" class="nav-item-pc ${State.currentView === 'settings' ? 'active' : ''}">
                        <i data-lucide="user"></i><span>Configurações</span>
                    </a>
                </nav>
            </aside>
            <main class="pc-main">
                <div style="max-width:1200px; margin:0 auto">
                    ${this.views[State.currentView] ? this.views[State.currentView]() : this.views.dashboard()}
                </div>
            </main>
        `;
    },

    renderLock() {
        const lock = document.getElementById('lock-screen');
        const now = new Date();
        const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

        const unread = State.notifications.filter(n => !n.read);
        const list = unread.map(n => `
            <div class="push-banner" style="transform:none; animation:none; margin-bottom:10px">
                <div class="push-icon"><i data-lucide="${n.type === 'pix' ? 'qr-code' : 'zap'}"></i></div>
                <div class="push-content">
                    <h5>${n.title}</h5>
                    <p><b>${n.title}</b><br>Valor: R$ ${Number(n.net || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
            </div>
        `).join('');

        lock.innerHTML = `
            <div class="status-bar"><span>Bunny 5G</span><i data-lucide="wifi"></i></div>
            <div class="lock-time" style="font-size:4rem; margin-top:40px">${time}</div>
            <div class="lock-date">${date}</div>
            <div style="width:100%; padding:20px; overflow-y:auto; flex:1">${list || '<p style="text-align:center; opacity:0.2">Aguardando...</p>'}</div>
            <div class="unlock-handle" onclick="UI.unlock()"></div>
        `;
        if (window.lucide) lucide.createIcons({ scope: lock });
    },

    unlock() { State.isLocked = false; this.render(); },
    lock() { State.isLocked = true; this.render(); },
    navigate(v) { State.currentView = v; this.render(); },

    components: {
        nav() {
            return `
                <nav class="bottom-nav">
                    <a href="javascript:UI.navigate('dashboard')" class="nav-link ${State.currentView === 'dashboard' ? 'active' : ''}">
                        <i data-lucide="layout-grid"></i><span>Painel</span>
                    </a>
                    <a href="javascript:UI.navigate('notifications')" class="nav-link ${State.currentView === 'notifications' ? 'active' : ''}">
                        <i data-lucide="bell"></i><span>Alertas</span>
                    </a>
                    <a href="javascript:UI.navigate('settings')" class="nav-link ${State.currentView === 'settings' ? 'active' : ''}">
                        <i data-lucide="user"></i><span>Perfil</span>
                    </a>
                </nav>
            `;
        }
    },

    views: {
        login() {
            return `
                <div class="animate-enter" style="padding-top:80px; text-align:center">
                    <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:30px">
                        <img src="logo.png?v=10" alt="Bunny Pay" style="width:140px; height:140px; object-fit:contain; filter:drop-shadow(0 4px 20px rgba(130, 10, 209, 0.3))">
                    </div>
                    <div class="card-luxe" style="text-align:left">
                        <input type="text" id="email" class="input-luxe" value="admin@bunny.app" style="margin-bottom:12px">
                        <input type="password" id="pass" class="input-luxe" value="12345" style="margin-bottom:20px">
                        <button class="btn-luxe btn-primary" onclick="Auth.login()">Entrar</button>
                    </div>
                </div>
            `;
        },
        dashboard() {
            // Faturamento Total: Apenas Venda Aprovada
            const net = State.notifications
                .filter(n => n.type === 'sale')
                .reduce((a, b) => a + (Number(b.net) || 0), 0);
            
            // Saldo para Saque (Vendas - Saques)
            const withdrawals = State.notifications
                .filter(n => n.type === 'withdraw')
                .reduce((a, b) => a + Math.abs(Number(b.net) || 0), 0);

            // Milestone Progress
            const totalEarned = net;
            const milestones = [10000, 50000, 100000, 250000, 500000, 1000000, 2000000, 5000000];
            let milestoneMin = 0, milestoneMax = 10000;
            for (let i = 0; i < milestones.length; i++) {
                if (totalEarned < milestones[i]) { milestoneMin = i === 0 ? 0 : milestones[i-1]; milestoneMax = milestones[i]; break; }
                if (i === milestones.length - 1) { milestoneMin = milestones[i-1]; milestoneMax = milestones[i]; }
            }
            const progressPct = Math.min(100, Math.round(((totalEarned - milestoneMin) / (milestoneMax - milestoneMin)) * 100));
            const fmtMilestone = (v) => v >= 1000000 ? (v/1000000).toLocaleString('pt-BR') + 'M' : (v/1000).toLocaleString('pt-BR') + 'K';


            const balanceAdj = Number(localStorage.getItem('bunny_balance_adj') || 0);
            const totalBalance = parseFloat((net - withdrawals + balanceAdj).toFixed(2));

            // Build last-7-days chart data from real notification timestamps
            const today = new Date();
            const labels = [];
            const chartData = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const dayStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                labels.push(dayStr);
                const dayNet = State.notifications
                    .filter(n => n.type !== 'withdraw')
                    .filter(n => {
                        const nd = new Date(n.timestamp);
                        return nd.toDateString() === d.toDateString();
                    })
                    .reduce((a, b) => a + (Number(b.net) || 0), 0);
                chartData.push(parseFloat(dayNet.toFixed(2)));
            }

            // Delayed chart render
            setTimeout(() => {
                const ctx = document.getElementById('salesChart');
                if (ctx && window.Chart) {
                    if (ctx.chartInstance) ctx.chartInstance.destroy();
                    ctx.chartInstance = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels,
                            datasets: [{
                                label: 'Vendas (R$)',
                                data: chartData,
                                borderColor: '#820AD1',
                                tension: 0.4,
                                backgroundColor: 'rgba(130,10,209,0.1)',
                                fill: true,
                                pointRadius: 3,
                                pointBackgroundColor: '#820AD1'
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                x: { display: true, ticks: { color: '#888', font: { size: 10 } }, grid: { display: false } },
                                y: { display: false }
                            }
                        }
                    });
                }
            }, 100);

            return `
                <div class="animate-enter" style="padding-top:40px; padding-bottom:80px">
                    <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:20px">
                        <img src="logo.png?v=10" alt="Bunny Pay" style="width:72px; height:72px; object-fit:contain; filter:drop-shadow(0 4px 15px rgba(130, 10, 209, 0.2))">
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:20px;">
                        <h2 class="outfit" style="font-size:1.5rem; min-width:0; flex:1;">Dashboard</h2>
                        <i data-lucide="bell-ring" onclick="System.askPermission()" style="cursor:pointer; color:var(--primary); flex-shrink:0; margin-left:10px;"></i>
                    </div>

                    <!-- Progress Bar -->
                    <div style="margin-bottom:20px; background:rgba(130,10,209,0.06); border:1px solid rgba(130,10,209,0.2); border-radius:20px; padding:16px 18px; box-sizing:border-box;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; gap:8px;">
                            <span style="font-size:0.68rem; opacity:0.45; white-space:nowrap;">R$ ${fmtMilestone(milestoneMin)}</span>
                            <span style="font-size:0.7rem; font-weight:700; color:var(--primary); white-space:nowrap; flex-shrink:0;">R$ ${fmtMilestone(milestoneMax)}</span>
                        </div>
                        <div style="background:rgba(255,255,255,0.07); border-radius:999px; height:8px; overflow:hidden; margin-bottom:6px;">
                            <div style="height:100%; width:${progressPct}%; background:linear-gradient(90deg, #820AD1, #c060ff); border-radius:999px; transition:width 0.8s ease;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; gap:8px;">
                            <span style="font-size:0.68rem; opacity:0.4;">${progressPct}% da meta</span>
                            <span style="font-size:0.68rem; opacity:0.4;">Faltam R$ ${Math.max(0, milestoneMax - totalEarned).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                        </div>
                    </div>

                    <div class="card-luxe" style="margin-bottom:20px; background:linear-gradient(135deg, rgba(130,10,209,0.05), transparent); position:relative;">
                        <button class="btn-luxe btn-primary" style="position:absolute; right:16px; top:16px; padding:8px 14px; font-size:0.75rem; width:auto; white-space:nowrap;" onclick="Actions.withdraw(event)">Sacar</button>
                        <p style="opacity:0.6; font-size:0.8rem; margin-bottom:4px;">Saldo Disponível para Saque</p>
                        <h3 class="outfit" style="font-size:clamp(1.3rem, 5vw, 2.2rem); margin-bottom:20px; padding-right:80px;">R$ ${totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                        <div style="height: 120px; width: 100%; position: relative;">
                            <canvas id="salesChart"></canvas>
                        </div>
                    </div>
                    
                    <h3 class="outfit" style="margin-top:30px; margin-bottom:15px; font-size:1.1rem;">Vendas Recentes</h3>
                    ${State.notifications.length === 0 ? '<p style="opacity:0.4; text-align:center; padding: 20px;">Nenhuma venda registrada.</p>' : ''}
                    ${State.notifications.slice(0, 5).map(n => `
                        <div class="ntf-card" style="flex-direction:column; gap:4px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; min-width:0;">
                                <b style="font-size:0.9rem; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n.title}</b>
                                <span style="opacity:0.4; font-size:0.7rem; flex-shrink:0;">${n.timestamp ? new Date(n.timestamp).toLocaleDateString('pt-BR') : ''}</span>
                            </div>
                            <span style="color:var(--success); font-size:0.85rem;">R$ ${Math.abs(Number(n.net)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        },

        products() {
            if (!State.isPC) return `<div class="animate-enter" style="padding-top:100px; text-align:center"><i data-lucide="monitor" style="width:48px; height:48px; opacity:0.2; margin-bottom:20px"></i><p style="opacity:0.5">Gestão de produtos disponível apenas no PC.</p></div>`;
            
            if (State.isPC) {
                // Lógica do gráfico para PC no painel de gerenciamento
                const today = new Date();
                const labels = [];
                const chartData = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(today);
                    d.setDate(today.getDate() - i);
                    labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
                    const dayNet = State.notifications
                        .filter(n => n.type === 'sale')
                        .filter(n => {
                            const nd = new Date(n.timestamp);
                            return nd.toDateString() === d.toDateString();
                        })
                        .reduce((a, b) => a + (Number(b.net) || 0), 0);
                    chartData.push(parseFloat(dayNet.toFixed(2)));
                }

                setTimeout(() => {
                    const ctx = document.getElementById('productsChart');
                    if (ctx && window.Chart) {
                        if (ctx.chartInstance) ctx.chartInstance.destroy();
                        ctx.chartInstance = new Chart(ctx, {
                            type: 'bar',
                            data: {
                                labels,
                                datasets: [{
                                    label: 'Volume de Vendas',
                                    data: chartData,
                                    backgroundColor: 'rgba(130,10,209,0.4)',
                                    borderRadius: 8
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false } },
                                scales: {
                                    x: { grid: { display: false } },
                                    y: { display: true, grid: { color: 'rgba(255,255,255,0.05)' } }
                                }
                            }
                        });
                    }
                }, 100);
            }

            return `
                <div class="animate-enter" style="padding-top:60px; padding-bottom:80px">
                    <h2 class="outfit" style="margin-bottom:40px">${State.isPC ? 'Painel de Gerenciamento' : 'Produtos'}</h2>
                    
                    ${State.isPC ? `
                        <div class="card-luxe" style="margin-bottom:30px; height:200px">
                            <canvas id="productsChart"></canvas>
                        </div>
                    ` : ''}

                    <div class="card-luxe" style="border-style:dashed; background:transparent; margin-bottom:20px">
                        <input type="text" id="pn" class="input-luxe" placeholder="Nome" style="margin-bottom:10px">
                        <input type="number" id="pv" class="input-luxe" placeholder="Preço" style="margin-bottom:20px">
                        <button class="btn-luxe btn-primary" onclick="Actions.add()">Criar</button>
                    </div>
                    ${State.products.map(p => `
                        <div class="card-luxe" style="margin-bottom:12px; padding:16px; display:flex; justify-content:space-between; align-items:center">
                            <div>
                                <div style="display:flex; align-items:center; gap:8px">
                                    <b id="p-name-${p.id}">${p.name}</b>
                                    <i data-lucide="edit" onclick="Actions.editProdPrompt('${p.id}')" style="cursor:pointer; color:var(--primary); width:16px; height:16px"></i>
                                </div>
                                <span id="p-val-${p.id}" style="font-size:0.9rem; opacity:0.7">Valor: ${Number(p.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                
                                ${!State.isPC ? `
                                <div style="display:flex; align-items:center; gap:5px; margin-top:5px">
                                    <span style="font-size:0.65rem; opacity:0.5">Vendas Auto:</span>
                                    <label class="switch" style="transform:scale(0.6); transform-origin:left">
                                        <input type="checkbox" ${p.is_active ? 'checked' : ''} onchange="Actions.toggleProdStatus('${p.id}', this.checked)">
                                        <span class="slider"></span>
                                    </label>
                                </div>
                                ` : ''}
                            </div>
                            <div onclick="Actions.deleteProd('${p.id}')" style="cursor:pointer; color:var(--error); padding:5px">
                                <i data-lucide="trash-2" style="width:18px; height:18px"></i>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        },
        notifications() {
            return `
                <div class="animate-enter" style="padding-top:60px; padding-bottom:80px">
                    <h2 class="outfit" style="margin-bottom:30px">Histórico</h2>
                    ${State.notifications.length === 0 ? '<p style="opacity:0.4; text-align:center; padding:30px;">Nenhuma notificação ainda.</p>' : ''}
                    ${State.notifications.map(n => `
                        <div class="ntf-card">
                            <b>${n.title}</b><br>
                            <span style="color:var(--success)">Valor: ${Math.abs(Number(n.net)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span style="float:right; opacity:0.4; font-size:0.75rem">${n.timestamp ? new Date(n.timestamp).toLocaleDateString('pt-BR') : ''}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        },
        settings() {
            const balanceAdj = Number(localStorage.getItem('bunny_balance_adj') || 0);
            const cfg = State.settings.custom_gen || { active: false, count: 30, interval: 10, productIds: [], turbo: false };

            // --- Milestone Progress Bar (Mobile) ---
            const totalEarned = State.notifications
                .filter(n => n.type === 'sale')
                .reduce((a, b) => a + (Number(b.net) || 0), 0);
            const milestones = [10000, 50000, 100000, 250000, 500000, 1000000, 2000000, 5000000];
            let milestoneMin = 0, milestoneMax = 10000;
            for (let i = 0; i < milestones.length; i++) {
                if (totalEarned < milestones[i]) { milestoneMin = i === 0 ? 0 : milestones[i-1]; milestoneMax = milestones[i]; break; }
                if (i === milestones.length - 1) { milestoneMin = milestones[i-1]; milestoneMax = milestones[i]; }
            }
            const progressPct = Math.min(100, Math.round(((totalEarned - milestoneMin) / (milestoneMax - milestoneMin)) * 100));
            const fmtMilestone = (v) => v >= 1000000 ? (v/1000000).toLocaleString('pt-BR') + 'M' : (v/1000).toLocaleString('pt-BR') + 'K';

            return `
                <div class="animate-enter" style="padding-top:60px; padding-bottom:80px">
                    <h2 class="outfit" style="margin-bottom:30px">Configurações</h2>

                    ${!State.isPC ? `
                    <div class="card-luxe" style="margin-bottom:25px; background: linear-gradient(135deg, rgba(130,10,209,0.12), rgba(0,0,0,0)); border: 1px solid rgba(130,10,209,0.3); padding: 22px 18px; box-sizing: border-box;">
                        <p style="font-size:0.75rem; opacity:0.5; letter-spacing:0.1em; margin-bottom:4px;">TOTAL FATURADO NA BUNNY PAY</p>
                        <h2 class="outfit" style="font-size:2rem; margin-bottom:18px; color:#fff;">R$ ${totalEarned.toLocaleString('pt-BR', {minimumFractionDigits:2})}</h2>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="font-size:0.7rem; opacity:0.4;">R$ ${fmtMilestone(milestoneMin)}</span>
                            <span style="font-size:0.7rem; font-weight:700; color:var(--primary);">🎯 META: R$ ${fmtMilestone(milestoneMax)}</span>
                        </div>
                        <div style="background:rgba(255,255,255,0.06); border-radius:999px; height:10px; overflow:hidden; margin-bottom:8px;">
                            <div style="height:100%; width:${progressPct}%; background:linear-gradient(90deg, #820AD1, #b84df0); border-radius:999px; transition: width 0.6s ease;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="font-size:0.75rem; opacity:0.5;">${progressPct}% concluído</span>
                            <span style="font-size:0.75rem; opacity:0.5;">Faltam R$ ${Math.max(0, milestoneMax - totalEarned).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                        </div>
                    </div>
                    ` : ''}

                    ${State.isPC ? `
                    <div class="card-luxe" style="margin-bottom:30px; border: 1px solid rgba(130,10,209,0.3); padding: 20px 15px; box-sizing: border-box;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom: 20px;">
                            <i data-lucide="zap" style="width:24px; height:24px; color:var(--primary); flex-shrink: 0;"></i>
                            <h3 class="outfit" style="margin:0; font-size: 1.1rem;">Gerador de Vendas Automáticas</h3>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; gap: 10px;">
                            <b style="color:${cfg.active ? 'var(--primary)' : 'white'}; font-size: 0.9rem; flex: 1;">MODO AUTOMÁTICO</b>
                            <label class="switch" style="flex-shrink: 0;">
                                <input type="checkbox" id="cg-active" ${cfg.active ? 'checked' : ''} onchange="Actions.saveCustomGen()">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <p style="font-size:0.8rem; opacity:0.6; margin-bottom: 20px; line-height: 1.4;">Gera vendas automaticamente (Pix → 45s → Venda aprovada).</p>
                        <h4 class="outfit" style="margin-bottom:12px; font-size: 0.9rem;">Produtos Ativos no Gerador</h4>
                        <div style="display:flex; flex-direction:column; gap:8px">
                            ${State.products.map(p => `
                                <div style="display:flex; align-items:center; gap:10px; padding:12px; border-radius:12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); width:100%; box-sizing:border-box; min-width:0;">
                                    <input type="checkbox" class="cg-prod-check" value="${p.id}" ${cfg.productIds.includes(p.id) ? 'checked' : ''} onchange="Actions.saveCustomGen()" style="flex-shrink:0; width:18px; height:18px; cursor:pointer;">
                                    <span style="font-size:0.85rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0;">${p.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="card-luxe" style="margin-bottom:20px">
                        <h4 class="outfit" style="margin-bottom:6px">Corrigir Saldo</h4>
                        <p style="font-size:0.8rem; opacity:0.5; margin-bottom:16px;">Adicione ou subtraia um valor fixo do saldo exibido.</p>
                        <input type="number" id="bal-adj" class="input-luxe" placeholder="Ex: 150.00 ou -50.00" value="${balanceAdj !== 0 ? balanceAdj : ''}" style="margin-bottom:12px">
                        <button class="btn-luxe btn-primary" onclick="Actions.saveBalanceAdj()">Salvar Correção</button>
                    </div>

                    <div class="card-luxe" style="margin-bottom:20px; border:1px solid var(--error)">
                        <h4 class="outfit" style="margin-bottom:10px; color:var(--error)">Zerar Dashboard</h4>
                        <p style="font-size:0.8rem; opacity:0.5; margin-bottom:16px;">Apaga todo o histórico de vendas e notificações. Produtos não são afetados.</p>
                        <button class="btn-luxe btn-secondary" style="color:var(--error)" onclick="Actions.resetDashboard()">Zerar Agora</button>
                    </div>
                    ` : ''}

                    <button class="btn-luxe btn-secondary" onclick="Auth.logout()" style="color:var(--error); margin-bottom: 20px;">Sair da Conta</button>
                    <p style="text-align:center; opacity:0.3; font-size:0.7rem">Bunny Pay v5.8</p>
                </div>
            `;
        }
    }
};

const Auth = {
    async login() {
        const btn = document.querySelector('button');
        const originalText = btn.innerText;
        btn.innerText = 'Entrando...';
        btn.disabled = true;

        const email = document.getElementById('email').value;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        try {
            await fetch(`${BACKEND_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            localStorage.setItem('bunny_user', JSON.stringify({ email }));
            State.user = { email };
            await State.fetchAll(); // Busca tudo do servidor apos login
            UI.render();
        } catch (e) {
            console.error('Servidor offline. Login feito localmente.');
            State.user = { email };
            localStorage.setItem('bunny_user', JSON.stringify({ email }));
            UI.render();
        } finally {
            if (btn) {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        }
    },
    logout() { 
        State.user = null; 
        State.products = [];
        State.notifications = [];
        localStorage.removeItem('bunny_user'); 
        localStorage.removeItem('bunny_products');
        localStorage.removeItem('bunny_notifications');
        UI.render(); 
    }
};

const Actions = {
    async gen(type) {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '...';
        btn.disabled = true;

        const sp = document.getElementById('sel-p').value;
        const vm = document.getElementById('val-m').value;
        const val = sp || vm;
        
        // Persistir escolha
        localStorage.setItem('bunny_last_prod', sp);
        localStorage.setItem('bunny_last_val', vm);

        const dateInput = document.getElementById('sale-date');
        const saleDate = dateInput && dateInput.value ? new Date(dateInput.value + 'T12:00:00').toISOString() : new Date(new Date().getTime() - 10800000).toISOString();

        if (!val) {
            alert('Insira um valor.');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        await State.notify(type, val, saleDate);
        UI.render();
    },

    async withdraw(event) {
        const net = State.notifications.reduce((a, b) => a + (Number(b.net) || 0), 0);
        if (net <= 0) return alert('Sem saldo disponível.');
        const pct = prompt(`Saldo disponível: ${net.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\nQuanto deseja sacar? (Apenas números)`);
        if (!pct) return;
        const val = parseFloat(pct.replace(',', '.'));
        if (isNaN(val) || val <= 0) return alert('Valor inválido.');
        if (val > net) return alert('Valor maior que o saldo disponível.');
        
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '...';
        btn.disabled = true;
        
        await State.notify('withdraw', val);
        UI.render();
    },

    async add() {
        const btn = document.querySelector('button.btn-primary');
        const originalText = btn ? btn.innerText : 'Criar';
        if (btn) { btn.innerText = 'Criando...'; btn.disabled = true; }

        const n = document.getElementById('pn').value;
        const v = document.getElementById('pv').value;

        if (!n || !v) {
            alert('Preencha nome e valor.');
            if (btn) { btn.innerText = originalText; btn.disabled = false; }
            return;
        }

        await State.addProduct(n, v);
        document.getElementById('pn').value = '';
        document.getElementById('pv').value = '';
        State.startGenerator(); // Pulso imediato
        UI.render();
    },

    deleteNotif(index) {
        State.notifications.splice(index, 1);
        State.saveLocal();
        UI.render();
    },

    clearAll() {
        if (!confirm('Limpar todo o histórico de notificações?')) return;
        State.notifications = [];
        State.saveLocal();
        UI.render();
    },

    saveBalanceAdj() {
        const val = parseFloat(document.getElementById('bal-adj').value);
        if (isNaN(val)) return alert('Digite um valor válido. Use negativo para subtrair.');
        localStorage.setItem('bunny_balance_adj', val.toFixed(2));
        UI.showToast('✅ Correção de saldo salva!');
        UI.render();
    },

    resetDashboard() {
        if (!confirm('Zerar todo o histórico de vendas e notificações?')) return;
        State.notifications = [];
        localStorage.removeItem('bunny_balance_adj');
        State.saveLocal();
        UI.showToast('✅ Dashboard zerada!');
        UI.render();
    },

    async toggleProdStatus(id, is_active) {
        try {
            await fetch(`${BACKEND_URL}/api/products/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active })
            });
            UI.showToast(is_active ? 'Gerador Ativado! 🚀' : 'Gerador Desativado');
        } catch (e) {
            const p = State.products.find(p => p.id === id);
            if (p) p.is_active = is_active;
            State.saveLocal();
        }
    },

    async editProdPrompt(id) {
        const p = State.products.find(p => p.id === id);
        if (!p) return;
        const name = prompt('Novo nome:', p.name);
        if (name === null) return;
        const value = prompt('Novo valor:', p.value);
        if (value === null) return;
        
        try {
            await fetch(`${BACKEND_URL}/api/products/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, value, is_active: 1 })
            });
            UI.showToast('✅ Produto atualizado e Fluxo Ativo!');
            State.startGenerator();
            UI.render();
        } catch (e) {
            p.name = name;
            p.value = parseFloat(value);
            p.is_active = 1;
            State.saveLocal();
            UI.render();
        }
    },

    async deleteProd(id) {
        if (!confirm('Excluir este produto?')) return;
        State.products = State.products.filter(p => p.id !== id);
        State.saveLocal();
        UI.render();
    },

    async saveSettings(chunks) {
        const newSettings = { ...State.settings, ...chunks };
        State.settings = newSettings;
        State.saveLocal();
        State.startGenerator();
        
        try {
            await fetch(`${BACKEND_URL}/api/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings)
            });
        } catch (e) { console.warn('Offline settings sync'); }
    },

    async saveCustomGen() {
        const active = document.getElementById('cg-active').checked;
        const checks = document.querySelectorAll('.cg-prod-check:checked');
        const productIds = Array.from(checks).map(c => c.value);

        const custom_gen = { active, turbo: false, count: 1, interval: 1, productIds };
        
        // Pulso imediato se ativado agora
        const wasInactive = !State.settings.custom_gen?.active;
        if (active && wasInactive) {
            UI.showToast('🚀 Iniciando Ciclo...');
        }

        await this.saveSettings({ custom_gen });
        UI.showToast('✅ Configurações de Fluxo Ativadas!');
    },

    async startPulse() {
        if (State.products.length === 0) return alert('Adicione produtos primeiro.');
        UI.showToast('🚀 Iniciando Vendas...');
        
        // Ativa o gerador principal se estiver desligado
        if (!State.settings.is_generator_on) {
            await this.saveSettings({ is_generator_on: 1 });
        }

        // Pulse inicial para todos os ativos
        for (const p of State.products) {
            if (p.is_active === 0) continue;
            await State.notify('pix', p.value);
            setTimeout(() => State.notify('sale', p.value), 2000);
        }
        UI.render();
    }
};

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js?v=2').then(reg => { window.swRegistration = reg; });
}

window.UI = UI; window.Auth = Auth; window.Actions = Actions; window.System = System;

// Helper: atualiza modo PC quando tamanho/orientação muda
function _updatePCMode() {
    const check = window.innerWidth > 680;
    if (check !== State.isPC) {
        State.isPC = check;
        UI.render();
    }
}

window.addEventListener('resize', _updatePCMode);
window.addEventListener('orientationchange', () => setTimeout(_updatePCMode, 150));


document.addEventListener('DOMContentLoaded', () => {
    UI.render();
    if (State.user) State.fetchAll();
});
if (window.lucide) lucide.createIcons();
