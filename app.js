// OZN PAY - Platform Engine v5.7
if (!localStorage.getItem('ozn_wiped_v57')) {
    localStorage.clear();
    localStorage.setItem('ozn_wiped_v57', 'true');
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
    user: JSON.parse(localStorage.getItem('ozn_user')) || null,
    products: JSON.parse(localStorage.getItem('ozn_products')) || [],
    notifications: JSON.parse(localStorage.getItem('ozn_notifications')) || [],
    currentView: 'dashboard',
    isLocked: false,

    async notify(type, value, customTimestamp = null) {
        const isWithdraw = type === 'withdraw';
        const gross = parseFloat(parseFloat(value).toFixed(2));
        const fee = isWithdraw ? 0 : parseFloat(((gross * 0.0599) + 2.49).toFixed(2));
        const net = isWithdraw ? -gross : parseFloat((gross - fee).toFixed(2));
        const title = isWithdraw ? 'Saque Realizado!' : (type === 'pix' ? 'Pix Gerado!' : 'Venda Aprovada!');
        
        // Ajuste para Brasília (UTC-3)
        const brTime = new Date(new Date().getTime() - (3 * 3600000));
        const timestamp = customTimestamp || brTime.toISOString();

        // Tentar enviar para o backend
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 200);
            const response = await fetch(`${BACKEND_URL}/api/notifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, value }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error('Falha na API');
            // WebSocket atualizará a UI
        } catch (e) {
            console.warn('Backend offline, salvando localmente:', e);
            // Fallback: criar localmente
            const notif = {
                id: Date.now(), type, title: title, value: gross, fee, net, timestamp, read: false
            };
            this.notifications.unshift(notif);
            this.saveLocal();
            System.trigger(notif);
        }
    },

    async addProduct(name, value) {
        const id = 'OZN-' + Math.random().toString(36).substr(2, 4).toUpperCase();
        const product = { id, name, value: parseFloat(value) };

        // Optimistic Update (Adiciona imediatamente)
        this.products.unshift(product);
        this.saveLocal();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            await fetch(`${BACKEND_URL}/api/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(product),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        } catch (e) {
            console.warn('Salvando produto apenas localmente (Offline)');
        }
    },

    saveLocal() {
        localStorage.setItem('ozn_products', JSON.stringify(this.products));
        localStorage.setItem('ozn_notifications', JSON.stringify(this.notifications));
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
        this.audio.currentTime = 0;
        this.audio.play().catch(() => { });
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
                <h5>OZN PAY</h5>
                <p><b>${notif.title}</b><br>Valor: ${Number(notif.net || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
                window.swRegistration.showNotification("OZN PAY", {
                    body: `${notif.title}\nValor: ${amount}`,
                    icon: 'logo.png',
                    badge: 'logo.png',
                    vibrate: [200, 100, 200],
                    tag: 'ozn-sale',
                    requireInteraction: true
                });
                return;
            } catch (e) { console.warn('SW falhou'); }
        }

        if (Notification.permission === "granted") {
            try {
                new Notification("OZN PAY", {
                    body: `${notif.title}\nValor: ${amount}`,
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

        if (State.isLocked) {
            app.style.display = 'none';
            lock.style.display = 'flex';
            return this.renderLock();
        }

        app.style.display = 'block';
        lock.style.display = 'none';

        if (!State.user) return app.innerHTML = this.views.login();

        app.innerHTML = `${this.views[State.currentView]()} ${this.components.nav()}`;
        if (window.lucide) lucide.createIcons();
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
                    <h5>OZN PAY</h5>
                    <p><b>${n.title}</b><br>Valor: ${Number(n.net || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
            </div>
        `).join('');

        lock.innerHTML = `
            <div class="status-bar"><span>OZN 5G</span><i data-lucide="wifi"></i></div>
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
                    <a href="javascript:UI.navigate('products')" class="nav-link ${State.currentView === 'products' ? 'active' : ''}">
                        <i data-lucide="package"></i><span>Estoque</span>
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
                    <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:25px">
                        <img src="logo.png" alt="OZN PAY" style="width:100px; height:100px; object-fit:contain; margin-bottom:15px; filter:drop-shadow(0 4px 12px rgba(0, 122, 255, 0.2))">
                        <h1 class="outfit" style="font-size:2rem">OZN<span style="opacity:0.3">PAY</span></h1>
                    </div>
                    <div class="card-luxe" style="text-align:left">
                        <input type="text" id="email" class="input-luxe" value="admin@ozn.app" style="margin-bottom:12px">
                        <input type="password" id="pass" class="input-luxe" value="12345" style="margin-bottom:20px">
                        <button class="btn-luxe btn-primary" onclick="Auth.login()">Entrar</button>
                    </div>
                </div>
            `;
        },
        dashboard() {
            const net = State.notifications.reduce((a, b) => a + (Number(b.net) || 0), 0);
            const balanceAdj = Number(localStorage.getItem('ozn_balance_adj') || 0);
            const totalBalance = parseFloat((net + balanceAdj).toFixed(2));

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
                                borderColor: '#007AFF',
                                tension: 0.4,
                                backgroundColor: 'rgba(0,122,255,0.1)',
                                fill: true,
                                pointRadius: 3,
                                pointBackgroundColor: '#007AFF'
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
                    <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:30px">
                        <img src="logo.png" alt="OZN PAY" style="width:60px; height:60px; object-fit:contain; margin-bottom:10px">
                        <div style="display:flex; justify-content:space-between; width:100%">
                            <h2 class="outfit">Dashboard</h2>
                            <i data-lucide="bell-ring" onclick="System.askPermission()" style="cursor:pointer; color:var(--primary)"></i>
                        </div>
                    </div>
                    <div class="card-luxe" style="margin-bottom:20px; background:linear-gradient(135deg, rgba(0,122,255,0.05), transparent); position:relative;">
                        <button class="btn-luxe btn-primary" style="position:absolute; right:20px; top:20px; padding:8px 16px; font-size:0.8rem; width:auto;" onclick="Actions.withdraw(event)">Sacar</button>
                        <p style="opacity:0.6; font-size:0.85rem; margin-bottom:4px;">Saldo Disponível para Saque</p>
                        <h3 class="outfit" style="font-size:2.4rem; margin-bottom:20px;">R$ ${totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                        <div style="height: 120px; width: 100%; position: relative;">
                            <canvas id="salesChart"></canvas>
                        </div>
                    </div>
                    
                    <h3 class="outfit" style="margin-top:30px; margin-bottom:15px">Vendas Recentes</h3>
                    ${State.notifications.length === 0 ? '<p style="opacity:0.4; text-align:center; padding: 20px;">Nenhuma venda registrada.</p>' : ''}
                    ${State.notifications.slice(0, 5).map(n => `
                        <div class="ntf-card">
                            <b>${n.title}</b><br>
                            <span style="color:var(--success)">Valor: ${Math.abs(Number(n.net)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span style="float:right; opacity:0.4; font-size:0.75rem">${n.timestamp ? new Date(n.timestamp).toLocaleDateString('pt-BR') : ''}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        },
        products() {
            return `
                <div class="animate-enter" style="padding-top:60px">
                    <h2 class="outfit" style="margin-bottom:40px">Produtos</h2>
                    <div class="card-luxe" style="border-style:dashed; background:transparent; margin-bottom:20px">
                        <input type="text" id="pn" class="input-luxe" placeholder="Nome" style="margin-bottom:10px">
                        <input type="number" id="pv" class="input-luxe" placeholder="Preço" style="margin-bottom:20px">
                        <button class="btn-luxe btn-primary" onclick="Actions.add()">Criar</button>
                    </div>
                    ${State.products.map(p => `
                        <div class="card-luxe" style="margin-bottom:12px; padding:16px">
                            <b>${p.name}</b><br>Valor: ${Number(p.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            const balanceAdj = Number(localStorage.getItem('ozn_balance_adj') || 0);
            return `
                <div class="animate-enter" style="padding-top:60px; padding-bottom:80px">
                    <h2 class="outfit" style="margin-bottom:40px">Configurações</h2>
                    
                    <div class="card-luxe" style="margin-bottom:20px; border: 1px solid var(--primary);">
                        <h4 class="outfit" style="margin-bottom:20px; color:var(--primary)">+ Gerar Venda Teste</h4>
                        <select id="sel-p" class="input-luxe" style="margin-bottom:12px">
                            <option value="">Valor Manual</option>
                            ${State.products.map(p => `<option value="${p.value}" ${localStorage.getItem('ozn_last_prod') == p.value ? 'selected' : ''}>${p.name}</option>`).join('')}
                        </select>
                        <input type="number" id="val-m" class="input-luxe" placeholder="R$ 0,00" value="${localStorage.getItem('ozn_last_val') || ''}" style="margin-bottom:12px">
                        <input type="date" id="sale-date" class="input-luxe" value="${localStorage.getItem('ozn_last_date') || new Date(new Date().getTime() - (3 * 3600000)).toISOString().split('T')[0]}" style="margin-bottom:20px">
                        <div style="display:flex; gap:10px">
                            <button class="btn-luxe btn-secondary" onclick="Actions.gen('pix')">Pix Aberto</button>
                            <button class="btn-luxe btn-primary" onclick="Actions.gen('sale')">Aprovada</button>
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
                    
                    <button class="btn-luxe btn-secondary" onclick="Auth.logout()" style="color:var(--error); margin-bottom: 20px;">Sair da Conta</button>
                    <p style="text-align:center; opacity:0.3; font-size:0.7rem">OZN PAY v5.7</p>
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

            localStorage.setItem('ozn_user', JSON.stringify({ email }));
            State.user = { email };
            UI.render();
        } catch (e) {
            console.error('Servidor offline. Login feito localmente.');
            State.user = { email };
            localStorage.setItem('ozn_user', JSON.stringify({ email }));
            UI.render();
        } finally {
            if (btn) {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        }
    },
    logout() { State.user = null; localStorage.removeItem('ozn_user'); UI.render(); }
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
        const dateInput = document.getElementById('sale-date');

        // Persistir escolha
        localStorage.setItem('ozn_last_prod', sp);
        localStorage.setItem('ozn_last_val', vm);
        localStorage.setItem('ozn_last_date', dateInput?.value || '');

        const saleDate = dateInput && dateInput.value ? new Date(dateInput.value + 'T12:00:00').toISOString() : new Date(new Date().getTime() - (3 * 3600000)).toISOString();

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
        localStorage.setItem('ozn_balance_adj', val.toFixed(2));
        UI.showToast('✅ Correção de saldo salva!');
        UI.render();
    },

    resetDashboard() {
        if (!confirm('Zerar todo o histórico de vendas e notificações?')) return;
        State.notifications = [];
        localStorage.removeItem('ozn_balance_adj');
        State.saveLocal();
        UI.showToast('✅ Dashboard zerada!');
        UI.render();
    }
};

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(reg => { window.swRegistration = reg; });
}

window.UI = UI; window.Auth = Auth; window.Actions = Actions; window.System = System;
document.addEventListener('DOMContentLoaded', () => UI.render());
if (window.lucide) lucide.createIcons();
