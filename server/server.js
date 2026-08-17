const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();

// CORS — пропускаем только наш сайт (локальный сервер и прод-домен).
// Без origin (file://, curl, запросы с того же origin) доступ разрешён.
const ALLOWED_ORIGINS = [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'https://nexora-zeta-ten.vercel.app'
];
app.use(cors({
    origin: function (origin, cb) {
        if (!origin || ALLOWED_ORIGINS.indexOf(origin) !== -1) return cb(null, true);
        return cb(null, false);
    }
}));
app.use(express.json({ limit: '10mb' }));

// ===========================================
// Serve static files from project root
// ===========================================
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path.endsWith('/') || req.path === '') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});
app.use(express.static(path.join(__dirname, '..')));

// ===========================================
// Admin API token — защита админских операций
// ===========================================
// Приоритет: 1) переменная окружения ADMIN_TOKEN, 2) сохранённый ключ
// в файле .admin-token, 3) новый случайный ключ (генерируется один раз
// и печатается в консоль).
// Публичного «демо-ключа» в коде больше нет: его знание позволяло бы менять
// админские данные (в т.ч. новости) любому, кто достучится до сервера.
const TOKEN_FILE = path.join(__dirname, '.admin-token');
function resolveAdminToken() {
    if (process.env.ADMIN_TOKEN) {
        console.log('[Nexora] ADMIN_TOKEN взят из переменной окружения.');
        return process.env.ADMIN_TOKEN;
    }
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const saved = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
            if (saved) return saved;
        }
        const token = 'nx_' + crypto.randomBytes(24).toString('hex');
        fs.writeFileSync(TOKEN_FILE, token, { encoding: 'utf8' });
        console.warn('[Nexora] Сгенерирован новый админ-ключ: ' + token);
        console.warn('[Nexora] Вставьте его в админке → Настройки → «Ключ доступа», иначе админские данные не будут сохраняться.');
        return token;
    } catch (err) {
        console.error('[Nexora] Не удалось сохранить админ-ключ в файл:', err.message);
        console.warn('[Nexora] Задайте ADMIN_TOKEN в переменных окружения и перезапустите сервер.');
        return '';
    }
}
const ADMIN_TOKEN = resolveAdminToken();

function getReqToken(req) {
    return (req.headers['x-admin-token']) || (req.body && req.body.token) || '';
}
function isAdminAuthorized(req) {
    return getReqToken(req) === ADMIN_TOKEN;
}

// Ключи, которые могут менять только админы (остальные — любые пользователи).
// nexora_support_tickets НЕ входит сюда: тикеты создают сами пользователи,
// сервер сливает их по id (см. /api/save).
const ADMIN_ONLY_KEYS = [
    'nexora_tournaments',
    'nexora_game_cards',
    'nexora_users',
    'nexora_roles',
    'nexora_results',
    'nexora_pending_regs',
    'nexora_news',
    'nexora_settings',
    'nexora_promocodes',
    'nexora_matches'
];

// Самоудаление своей регистрации (leave tournament) не требует токена,
// всё остальное (удаление команд/турниров/пользователей) — требует.
function isSelfLeave(filters) {
    if (!filters || typeof filters !== 'object') return false;
    var keys = Object.keys(filters);
    if (keys.length === 0) return false;
    var allowed = { userId: true, tournamentId: true };
    for (var i = 0; i < keys.length; i++) {
        if (!allowed[keys[i]]) return false;
    }
    return !!filters.userId && !!filters.tournamentId;
}


// ===========================================
// Data storage (shared across browsers)
// ===========================================
const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Error reading data file:', err.message);
    }
    return {};
}

// ===========================================
// Хеширование паролей — защита от хранения в открытом виде
// ===========================================

// Приводит пароль к формату 'sha256$' + hex. Уже хешированные пропускает.
function hashPassword(plain) {
    if (typeof plain !== 'string' || !plain) return plain;
    if (plain.indexOf('sha256$') === 0) return plain;
    return 'sha256$' + crypto.createHash('sha256').update(plain, 'utf8').digest('hex');
}

// Санитизация секретов в данных: хеширует открытые пароли в nexora_users
// и nexora_pending_regs. Вызывается при каждой записи, чтобы клиентские
// данные (которые могут прийти со старыми открытыми паролями из localStorage)
// не «расхешировали» сервер.
function sanitizeSecrets(data) {
    if (!data || typeof data !== 'object') return data;
    ['nexora_users', 'nexora_pending_regs'].forEach(function(key) {
        const arr = data[key];
        if (!Array.isArray(arr)) return;
        arr.forEach(function(rec) {
            if (rec && typeof rec === 'object' && 'password' in rec) {
                rec.password = hashPassword(rec.password);
            }
        });
    });
    return data;
}

function writeData(data) {
    try {
        sanitizeSecrets(data);
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('Error writing data file:', err.message);
    }
}

// Одноразовая миграция при старте: хешируем открытые пароли в data.json
(function migrateDataFile() {
    try {
        const data = readData();
        const before = JSON.stringify(data);
        sanitizeSecrets(data);
        if (JSON.stringify(data) !== before) {
            writeData(data);
            console.log('[Nexora] Passwords in data.json migrated to SHA-256 hashes');
        }
    } catch (err) {
        console.error('Migration error:', err.message);
    }
})();


// ====== Гарантируем команды для "Присоединиться" (только в памяти, не меняет файл) ======
function ensureSampleTeams(data) {
    var teams = data.nexora_registrations || [];
    var hasCaptain = teams.some(function(r) { return r.role === 'captain'; });
    if (hasCaptain) return data;

    // Если есть регистрации с названием команды без role — делаем их captain
    var toUpgrade = teams.filter(function(r) { return r.teamName && !r.role; });
    if (toUpgrade.length > 0) {
        toUpgrade.forEach(function(r) {
            r.role = 'captain';
            r.teamId = r.teamId || 'team_' + Math.random().toString(36).substr(2, 8);
            r.teammates = r.teammates || [{ nickname: r.userId, playerId: r.playerId }];
        });
    }
    // Если нет вообще регистраций — ничего не добавляем
    return data;
}


// ===========================================
// Уведомления в Telegram организатору
// ===========================================
// При появлении новых заявок / оплат / тикетов / запросов в команду
// организатору уходит сообщение в Telegram. Chat ID берётся из
// nexora_settings.telegram_chat_id (вводится в админке → Настройки).
function tgEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function tgSendMessage(chatId, text) {
    try {
        const r = await fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
        });
        if (!r.ok) console.error('tg sendMessage:', r.status, (await r.text()).slice(0, 300));
    } catch (err) {
        console.error('tg send error:', err && err.message);
    }
}

function tgSnapshot(state) {
    return {
        regs: new Set((state.nexora_registrations || []).map(function(r) { return r.userId + '_' + r.tournamentId; })),
        pays: new Set((state.nexora_payments || []).map(function(p) { return p.id; })),
        tickets: new Set((state.nexora_support_tickets || []).map(function(t) { return t.id; })),
        joins: new Set((state.nexora_join_requests || []).map(function(j) { return j.id; }))
    };
}

async function tgNotifyNew(existing, before) {
    const settings = (existing && existing.nexora_settings) || {};
    const chatId = String(settings.telegram_chat_id || '').trim() || process.env.ADMIN_TG_CHAT_ID || '';
    if (!chatId) return;

    const tours = {};
    (existing.nexora_tournaments || []).forEach(function(t) {
        if (t && t.id != null) tours[t.id] = t.name || ('турнир #' + t.id);
    });

    const newRegKeys = new Set();
    (existing.nexora_registrations || []).forEach(function(r) {
        const uk = r.userId + '_' + r.tournamentId;
        if (!before.regs.has(uk)) newRegKeys.add(uk);
    });

    const msgs = [];

    (existing.nexora_registrations || []).forEach(function(r) {
        const uk = r.userId + '_' + r.tournamentId;
        if (before.regs.has(uk)) return;
        msgs.push(
            '📋 <b>Новая заявка</b>\n' +
            tgEsc(r.userId) + ' → ' + tgEsc(tours[r.tournamentId] || ('турнир #' + r.tournamentId)) +
            '\n' + (r.paid ? '✅ оплачено' : '⏳ ожидает оплаты')
        );
    });

    (existing.nexora_payments || []).forEach(function(p) {
        if (!p || before.pays.has(p.id)) return;
        if (newRegKeys.has((p.userId || '') + '_' + (p.tournamentId || ''))) return;
        msgs.push(
            '💳 <b>Оплата</b> ' + (p.test ? '(тест)' : '') + '\n' +
            tgEsc(p.userId || '—') + ' · ' + Number(p.amount || 0).toLocaleString('ru-RU') + ' ₽\n' +
            tgEsc(tours[p.tournamentId] || '') + (p.status ? ' · ' + p.status : '')
        );
    });

    (existing.nexora_support_tickets || []).forEach(function(t) {
        if (!t || before.tickets.has(t.id)) return;
        msgs.push('🎫 <b>Новый тикет</b>\n' + tgEsc(t.userId || '—') + ': ' + tgEsc(String(t.subject || t.message || '').slice(0, 80)));
    });

    (existing.nexora_join_requests || []).forEach(function(j) {
        if (!j || before.joins.has(j.id)) return;
        msgs.push('🤝 <b>Заявка в команду</b>\n' + tgEsc(j.userId || '—') + ' → ' + tgEsc(j.teamName || '—'));
    });

    for (let i = 0; i < msgs.length; i++) {
        await tgSendMessage(chatId, msgs[i]);
        await new Promise(function(resolve) { setTimeout(resolve, 120); });
    }
}

// Мерж обращений поддержки: объединяем переписку (messages) по from+время,
// а НЕ заменяем тикет целиком. Иначе клиент с устаревшей локальной копией
// (админ ответил в другом браузере, а игрок ещё не дотянул его ответ)
// перезаписывает свежие сообщения другой стороны — они «пропадают».
function mergeTickets(serverArr, clientArr) {
    const merged = {};
    serverArr.forEach(function(t) {
        if (t && t.id) merged[t.id] = JSON.parse(JSON.stringify(t));
    });
    clientArr.forEach(function(t) {
        if (!t || !t.id) return;
        const cur = merged[t.id];
        if (!cur) { merged[t.id] = JSON.parse(JSON.stringify(t)); return; }

        const msgMap = {};
        function addMsg(m) {
            if (m && m.at && m.from) msgMap[m.from + '|' + m.at] = m;
        }
        (Array.isArray(cur.messages) ? cur.messages : []).forEach(addMsg);
        (Array.isArray(t.messages) ? t.messages : []).forEach(addMsg);
        // Старый формат тикета (поле message/reply без массива messages)
        // переносим в переписку, если её там ещё нет.
        if (cur.message) addMsg({ from: 'user', text: cur.message, at: cur.createdAt });
        if (cur.reply)   addMsg({ from: 'admin', text: cur.reply, at: cur.repliedAt });
        if (t.message)   addMsg({ from: 'user', text: t.message, at: t.createdAt });
        if (t.reply)     addMsg({ from: 'admin', text: t.reply, at: t.repliedAt });

        const msgs = Object.values(msgMap).sort(function(a, b) {
            return new Date(a.at) - new Date(b.at);
        });
        cur.messages = msgs;

        // Дозаполняем поля, которых нет в серверной копии.
        ['userId', 'email', 'topic', 'subject', 'message', 'createdAt', 'reply', 'repliedAt'].forEach(function(f) {
            if (cur[f] == null && t[f] != null) cur[f] = t[f];
        });

        // Статус определяет последнее сообщение: ответ игрока → «Ожидает ответа»,
        // ответ организатора → «Отвечен». Закрытое обращение переоткрываем только
        // если в пуше действительно появилось новое сообщение игрока.
        const last = msgs[msgs.length - 1];
        if (last) {
            const desired = last.from === 'user' ? 'open' : 'answered';
            if (cur.status !== 'closed' || desired === 'open') cur.status = desired;
        }
        merged[t.id] = cur;
    });
    return Object.values(merged);
}

// POST /api/save — save all nexora data from client
app.post('/api/save', async (req, res) => {
    const data = req.body || {};
    const authorized = isAdminAuthorized(req);
    // Если в запросе есть админские ключи и ключ доступа передан, но неверный —
    // отвечаем громко (403) вместо молчаливого игнорирования, чтобы администратор
    // сразу увидел, что запись не ушла на сервер. У обычного пользователя без
    // ключа админские ключи по-прежнему пропускаются молча (данные не ломаются).
    const hasAdminKey = Object.keys(data).some(function(k) {
        return ADMIN_ONLY_KEYS.indexOf(k) !== -1;
    });
    const sentToken = getReqToken(req);
    if (hasAdminKey && !authorized && sentToken) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden: неверный ключ доступа администратора. Проверьте Настройки → Ключ доступа.'
        });
    }
    // Полная очистка обращений поддержки — только с ключом доступа администратора
    if (data.nexora_clear_support_tickets === true && !authorized) {
        return res.status(403).json({ success: false, error: 'Forbidden: admin token required' });
    }
    // Only allow nexora_ keys
    const clean = {};
    Object.keys(data).forEach(key => {
        if (key.startsWith('nexora_')) {
            if (key === 'nexora_clear_support_tickets') return;
            // Админские ключи сохраняются только с валидным токеном,
            // у обычного пользователя они молча игнорируются (данные не ломаются)
            if (ADMIN_ONLY_KEYS.indexOf(key) !== -1 && !authorized) return;
            clean[key] = data[key];
        }
    });
    // Merge with existing data — preserve server data for keys client sent empty
    const existing = readData();
    const before = tgSnapshot(existing);
    if (data.nexora_clear_support_tickets === true) {
        existing['nexora_support_tickets'] = [];
    }
    Object.keys(clean).forEach(key => {
        const val = clean[key];
        // Skip empty arrays/objects to avoid wiping server data
        if (Array.isArray(val) && val.length === 0) return;
        if (typeof val === 'object' && val !== null && !Array.isArray(val) && Object.keys(val).length === 0) return;
        if (val === null || val === undefined) return;

        // Мержим массивы регистраций и заявок по уникальному ключу,
        // чтобы клиенты не стирали данные друг друга
        if (key === 'nexora_registrations' && Array.isArray(val)) {
            const existingArr = Array.isArray(existing[key]) ? existing[key] : [];
            const merged = {};
            // Сначала все серверные записи
            existingArr.forEach(function(item) {
                const uk = item.userId + '_' + item.tournamentId;
                merged[uk] = item;
            });
            // Потом клиентские — перезаписывают если есть дубликат
            val.forEach(function(item) {
                const uk = item.userId + '_' + item.tournamentId;
                merged[uk] = item;
            });
            existing[key] = Object.values(merged);
            return;
        }

        if (key === 'nexora_join_requests' && Array.isArray(val)) {
            const existingArr = Array.isArray(existing[key]) ? existing[key] : [];
            const merged = {};
            existingArr.forEach(function(item) { if (item.id) merged[item.id] = item; });
            val.forEach(function(item) { if (item.id) merged[item.id] = item; });
            existing[key] = Object.values(merged);
            return;
        }

        if (key === 'nexora_support_tickets' && Array.isArray(val)) {
            existing[key] = mergeTickets(
                Array.isArray(existing[key]) ? existing[key] : [],
                val
            );
            return;
        }

        existing[key] = val;
    });
    writeData(existing);
    try { await tgNotifyNew(existing, before); } catch (e) { console.error('tgNotifyNew:', e && e.message); }
    res.json({ success: true });
});

// POST /api/delete — удалить записи по фильтру (для админа)
app.post('/api/delete', (req, res) => {
    const { key, filters } = req.body || {};
    if (!key || !key.startsWith('nexora_') || !filters || typeof filters !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid params' });
    }
    // Самоудаление своей регистрации разрешено, остальное — только с токеном
    if (!isSelfLeave(filters) && !isAdminAuthorized(req)) {
        return res.status(403).json({ success: false, error: 'Forbidden: admin token required' });
    }
    const data = readData();
    const arr = Array.isArray(data[key]) ? data[key] : [];
    const before = arr.length;
    data[key] = arr.filter(function(item) {
        for (var k in filters) {
            if (filters.hasOwnProperty(k)) {
                if (item[k] != filters[k]) return true; // не совпало — оставляем
            }
        }
        return false; // все фильтры совпали — удаляем
    });
    writeData(data);
    res.json({ success: true, deleted: before - data[key].length });
});

// GET /api/load — load all nexora data for client
app.get('/api/load', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const allData = readData();
    // Гарантируем команды для "Присоединиться" (не меняет файл, только ответ)
    ensureSampleTeams(allData);
    res.json(allData);
});

// SMTP transport для отправки писем
// Отправитель по умолчанию — justxirrez@inbox.ru (рабочий пароль приложения SMS Light).
// Чтобы слать от marse2007@bk.ru, задайте SMTP_USER/SMTP_FROM и поменяйте SMTP_PASSWORD
// на пароль приложения этого ящика (Настройки → Безопасность → Пароли для внешних приложений).
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mail.ru',
    port: 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER || 'justxirrez@inbox.ru',
        pass: process.env.SMTP_PASSWORD
    }
});

// POST /send-code — отправка кода подтверждения
app.post('/send-code', async (req, res) => {
    try {
        const { to_email, to_name, code } = req.body;

        if (!to_email || !to_name || !code) {
            return res.status(400).json({ success: false, error: 'Missing fields' });
        }

        await transporter.sendMail({
            from: '"Nexora" <' + (process.env.SMTP_FROM || 'justxirrez@inbox.ru') + '>',
            to: to_email,
            subject: 'Код подтверждения регистрации Nexora',
            html: `
                <div style="background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;padding:32px;max-width:480px;margin:0 auto;border:1px solid #222;border-radius:12px">
                    <div style="text-align:center;margin-bottom:24px">
                        <span style="display:inline-block;background:#0A0B0E;color:#FFFFFF;width:32px;height:32px;line-height:30px;border-radius:8px;border:1px solid #D7DAE0;font-weight:700;font-size:14px">N</span>
                    </div>
                    <h1 style="color:#fff;font-size:18px;margin:0 0 8px">Привет, ${to_name}!</h1>
                    <p style="color:#a0a0a0;font-size:14px;margin:0 0 20px">Твой код для регистрации на Nexora:</p>
                    <div style="background:#111;border:1px solid #D7DAE0;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px">
                        <span style="font-size:32px;font-weight:700;color:#0A0B0E;letter-spacing:6px;font-family:monospace">${code}</span>
                    </div>
                    <p style="color:#666;font-size:11px;margin:0">Код действителен до завершения регистрации. Если ты не запрашивал код, просто проигнорируй это письмо.</p>
                    <hr style="border:none;border-top:1px solid #222;margin:20px 0">
                    <p style="color:#666;font-size:10px;text-align:center;margin:0">Nexora — Турнир где рождаются легенды</p>
                </div>
            `
        });

        console.log(`Code sent to ${to_email}`);
        res.json({ success: true });

    } catch (err) {
        console.error('Send error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /send-notify — email-уведомления участникам (одно/много писем)
app.post('/send-notify', async (req, res) => {
    try {
        const { to_email, to_emails, subject, html } = req.body || {};
        let emails = Array.isArray(to_emails) ? to_emails.slice() : [];
        if (to_email && emails.indexOf(to_email) === -1) emails.push(to_email);
        emails = emails.filter(e => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()));
        const unique = [];
        emails.forEach(e => { const t = e.trim(); if (unique.indexOf(t) === -1) unique.push(t); });

        if (!unique.length) {
            return res.status(400).json({ success: false, error: 'No valid recipients' });
        }
        if (!subject || !html) {
            return res.status(400).json({ success: false, error: 'Missing subject/html' });
        }

        let sent = 0;
        for (const email of unique) {
            await transporter.sendMail({
                from: '"Nexora" <' + (process.env.SMTP_FROM || 'justxirrez@inbox.ru') + '>',
                to: email,
                subject,
                html
            });
            sent++;
        }
        console.log(`[Nexora] Notification sent to ${sent} recipient(s)`);
        res.json({ success: true, sent });
    } catch (err) {
        console.error('[Nexora] Notify error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /ping — проверка что сервер жив
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ===========================================
// Вход через Telegram-бота (без виджета)
// ===========================================
// Официальный Telegram Login Widget работает только на домене, привязанном
// к боту (/setdomain в @BotFather) — на file:// и localhost он выдаёт
// «Bot domain invalid». Поэтому здесь реализован обходной вход: сайт
// генерирует код и открывает https://t.me/<bot>?start=LOGIN_<код>, бот
// получает сообщение /start LOGIN_<код> вместе с профилем пользователя,
// а сайт опрашивает /api/tg-check?code=... и завершает вход.
// Токен бота — тот же, что в js/social-config.js.
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8835168766:AAFSVqB4nmdhXaOR4MTZMYaz_LHH8j2haKk';
const TG_API = 'https://api.telegram.org/bot' + TG_TOKEN;

// code -> { profile, ts }. In-memory, коды живут 5 минут.
const tgSessions = new Map();

let tgOffset = 0;
async function tgPoll() {
    try {
        const resp = await fetch(TG_API + '/getUpdates?timeout=25&offset=' + tgOffset);
        const data = await resp.json();
        if (data && data.ok && Array.isArray(data.result)) {
            data.result.forEach(function(u) {
                if (u.update_id >= tgOffset) tgOffset = u.update_id + 1;
                const msg = u.message || u.channel_post;
                if (!msg || !msg.from) return;
                const text = msg.text || '';
                const m = text.match(/^\/start\s+(LOGIN_\d+)$/);
                if (!m) {
                    // Организатору: бот отвечает своим Chat ID командами /id или /start.
                    // Нужно, чтобы вписать его в админке → Настройки → Telegram ID.
                    if (/^\/id\s*$/i.test(text) || /^\/start\s*$/i.test(text)) {
                        tgSendMessage(msg.chat.id, 'Ваш Chat ID для уведомлений Nexora:\n<code>' + msg.chat.id + '</code>\n\nВставьте его в админке → Настройки → «Telegram ID для уведомлений».');
                    }
                    return;
                }
                const from = msg.from;
                const name = ((from.first_name || '') + ' ' + (from.last_name || '')).trim();
                tgSessions.set(m[1], {
                    profile: {
                        id: String(from.id),
                        name: name || from.username || 'Telegram user',
                        username: from.username || '',
                        avatar: null
                    },
                    ts: Date.now()
                });
                console.log('[Telegram] Login code received:', m[1], '→', name);
            });
        }
    } catch (err) {
        // сеть недоступна — пробуем на следующем тике
    }
    // Чистим протухшие коды (старше 5 минут)
    const now = Date.now();
    tgSessions.forEach(function(v, k) { if (now - v.ts > 5 * 60 * 1000) tgSessions.delete(k); });
    setTimeout(tgPoll, 1500);
}
tgPoll();

// GET /test-tg?chat_id=... — тестовое уведомление организатору из админки
app.get('/test-tg', async (req, res) => {
    const chatId = String(req.query.chat_id || '').trim();
    if (!chatId) return res.json({ success: false, error: 'chat_id не указан' });
    try {
        const r = await fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: 'Тест уведомлений Nexora — если вы это читаете, всё работает ✅',
                parse_mode: 'HTML'
            })
        });
        const j = await r.json();
        res.json(j && j.ok ? { success: true } : { success: false, error: (j && j.description) || 'sendMessage failed' });
    } catch (e) {
        res.json({ success: false, error: e && e.message || 'network error' });
    }
});

// GET /api/tg-check?code=LOGIN_XXXX — сайт забирает профиль после /start у бота
app.get('/api/tg-check', (req, res) => {
    const code = req.query.code || '';
    const sess = tgSessions.get(code);
    if (!sess) return res.json({ success: false });
    tgSessions.delete(code);
    res.json({ success: true, profile: sess.profile });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Nexora server running on port ${PORT} — http://localhost:${PORT}`);
});
