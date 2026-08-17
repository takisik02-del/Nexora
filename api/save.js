// Nexora — POST /api/save: синхронизация данных между браузерами на Vercel.
// Хранилище: Vercel Blob (переменная окружения BLOB_READ_WRITE_TOKEN).
// Поведение повторяет server/server.js:
//   • merge массивов registrations/join_requests/support_tickets по уникальным ключам,
//   • админские ключи сохраняются только с валидным ADMIN_TOKEN,
//   • при неверном переданном ключе отвечаем 403 (а не молча пропускаем),
//   • новые заявки / оплаты / тикеты → уведомление организатору в Telegram,
//   • раз в сутки в Blob создаётся резервная копия nexora/backups/state-<дата>.json.
const { put, list, get, del } = require('@vercel/blob');

const STORE_PREFIX = 'nexora/state.json';
const BACKUP_PREFIX = 'nexora/backups/';
// Резервный токен: чтобы уведомления работали и без переменных окружения.
// Основной источник — переменная окружения TELEGRAM_BOT_TOKEN.
const TG_TOKEN_DEFAULT = '8835168766:AAFSVqB4nmdhXaOR4MTZMYaz_LHH8j2haKk';

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

function getReqToken(req) {
    const h = req.headers['x-admin-token'];
    if (h) return h;
    if (req.body && req.body.token) return req.body.token;
    return '';
}

async function readState() {
    const { blobs } = await list({ prefix: STORE_PREFIX });
    if (!blobs.length) return {};
    // useCache: false — иначе CDN может отдать устаревшую копию после перезаписи.
    const blob = await get(blobs[0].url, { access: 'private', useCache: false });
    if (!blob || !blob.stream) return {};
    return await new Response(blob.stream).json();
}

function mergeByKey(existing, val, keyOf) {
    const merged = {};
    existing.forEach(function(item) { const uk = keyOf(item); merged[uk] = item; });
    val.forEach(function(item) { const uk = keyOf(item); merged[uk] = item; });
    return Object.values(merged);
}

// Мерж обращений поддержки: объединяем переписку (messages) по from+время,
// а НЕ заменяем тикет целиком — иначе клиент со старой локальной копией
// затирает свежие сообщения другой стороны (баг «пропадают сообщения»).
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
        if (cur.message) addMsg({ from: 'user', text: cur.message, at: cur.createdAt });
        if (cur.reply)   addMsg({ from: 'admin', text: cur.reply, at: cur.repliedAt });
        if (t.message)   addMsg({ from: 'user', text: t.message, at: t.createdAt });
        if (t.reply)     addMsg({ from: 'admin', text: t.reply, at: t.repliedAt });

        const msgs = Object.values(msgMap).sort(function(a, b) {
            return new Date(a.at) - new Date(b.at);
        });
        cur.messages = msgs;

        ['userId', 'email', 'topic', 'subject', 'message', 'createdAt', 'reply', 'repliedAt'].forEach(function(f) {
            if (cur[f] == null && t[f] != null) cur[f] = t[f];
        });

        const last = msgs[msgs.length - 1];
        if (last) {
            const desired = last.from === 'user' ? 'open' : 'answered';
            if (cur.status !== 'closed' || desired === 'open') cur.status = desired;
        }
        merged[t.id] = cur;
    });
    return Object.values(merged);
}

// Множества уникальных ключей текущих данных — для поиска «новых» записей.
function snapshotKeys(state) {
    return {
        regs: new Set((state.nexora_registrations || []).map(function(r) { return r.userId + '_' + r.tournamentId; })),
        pays: new Set((state.nexora_payments || []).map(function(p) { return p.id; })),
        tickets: new Set((state.nexora_support_tickets || []).map(function(t) { return t.id; })),
        joins: new Set((state.nexora_join_requests || []).map(function(j) { return j.id; }))
    };
}

function tgEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendTelegram(token, chatId, text) {
    try {
        const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            })
        });
        if (!r.ok) console.error('telegram sendMessage:', r.status, (await r.text()).slice(0, 300));
    } catch (err) {
        console.error('telegram error:', err && err.message);
    }
}

// Собирает сообщения о записях, появившихся после предыдущего среза, и шлёт их.
async function notifyChanges(existing, before) {
    const settings = (existing && existing.nexora_settings) || {};
    const chatId = String(settings.telegram_chat_id || '').trim() || process.env.ADMIN_TG_CHAT_ID || '';
    if (!chatId) return;
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_TOKEN_DEFAULT;

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
        // Оплата, пришедшая вместе с новой заявкой, уже упомянута выше — не дублируем.
        if (newRegKeys.has((p.userId || '') + '_' + (p.tournamentId || ''))) return;
        msgs.push(
            '💳 <b>Оплата</b> ' + (p.test ? '(тест)' : '') + '\n' +
            tgEsc(p.userId || '—') + ' · ' + Number(p.amount || 0).toLocaleString('ru-RU') + ' ₽\n' +
            tgEsc(tours[p.tournamentId] || '') + (p.status ? ' · ' + p.status : '')
        );
    });

    (existing.nexora_support_tickets || []).forEach(function(t) {
        if (!t || before.tickets.has(t.id)) return;
        const subj = t.subject || t.message || '';
        msgs.push(
            '🎫 <b>Новый тикет</b>\n' +
            tgEsc(t.userId || '—') + ': ' + tgEsc(String(subj).slice(0, 80))
        );
    });

    (existing.nexora_join_requests || []).forEach(function(j) {
        if (!j || before.joins.has(j.id)) return;
        msgs.push(
            '🤝 <b>Заявка в команду</b>\n' +
            tgEsc(j.userId || '—') + ' → ' + tgEsc(j.teamName || '—')
        );
    });

    for (let i = 0; i < msgs.length; i++) {
        await sendTelegram(token, chatId, msgs[i]);
        // Лёгкая пауза между сообщениями, чтобы не упереться в лимиты Telegram.
        await new Promise(function(resolve) { setTimeout(resolve, 120); });
    }
}

// Раз в сутки пишем снапшот всего состояния; храним последние 10 копий.
async function backupIfNeeded(state) {
    const today = new Date().toISOString().slice(0, 10);
    const { blobs } = await list({ prefix: BACKUP_PREFIX });
    const hasToday = blobs.some(function(b) { return b.pathname.indexOf('state-' + today) !== -1; });
    if (!hasToday) {
        await put(BACKUP_PREFIX + 'state-' + today + '.json', JSON.stringify(state), {
            access: 'private',
            allowOverwrite: true,
            addRandomSuffix: false,
            cacheControlMaxAge: 60,
            contentType: 'application/json'
        });
        blobs.push({ pathname: BACKUP_PREFIX + 'state-' + today + '.json' });
    }
    const all = blobs.map(function(b) { return b.pathname; }).sort();
    while (all.length > 10) {
        const oldPath = all.shift();
        try { await del(oldPath); } catch (e) { console.error('backup del:', e && e.message); }
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const data = req.body || {};
        const sentToken = getReqToken(req);
        const authorized = !!process.env.ADMIN_TOKEN && sentToken === process.env.ADMIN_TOKEN;

        const hasAdminKey = Object.keys(data).some(function(k) {
            return ADMIN_ONLY_KEYS.indexOf(k) !== -1;
        });
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

        const existing = await readState();
        const before = snapshotKeys(existing);

        if (data.nexora_clear_support_tickets === true) {
            existing['nexora_support_tickets'] = [];
        }

        Object.keys(data).forEach(function(key) {
            if (key.indexOf('nexora_') !== 0) return;
            if (key === 'nexora_clear_support_tickets') return;
            if (ADMIN_ONLY_KEYS.indexOf(key) !== -1 && !authorized) return;
            const val = data[key];
            if (Array.isArray(val) && val.length === 0) return;
            if (val === null || val === undefined) return;
            if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return;

            if (key === 'nexora_registrations' && Array.isArray(val)) {
                existing[key] = mergeByKey(
                    Array.isArray(existing[key]) ? existing[key] : [], val,
                    function(item) { return item.userId + '_' + item.tournamentId; });
                return;
            }
            if (key === 'nexora_join_requests' && Array.isArray(val)) {
                existing[key] = mergeByKey(
                    Array.isArray(existing[key]) ? existing[key] : [], val,
                    function(item) { return item.id; });
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

        // Блоб иммутабелен по pathname, поэтому перезапись через allowOverwrite: true.
        // cacheControlMaxAge: 60 — минимальный TTL, чтобы CDN-копия не жила месяц.
        await put(STORE_PREFIX, JSON.stringify(existing), {
            access: 'private',
            allowOverwrite: true,
            addRandomSuffix: false,
            cacheControlMaxAge: 60,
            contentType: 'application/json'
        });

        // Уведомления и бэкап не должны ронять сохранение, если что-то пойдёт не так.
        try { await notifyChanges(existing, before); } catch (e) { console.error('notifyChanges:', e && e.message); }
        try { await backupIfNeeded(existing); } catch (e) { console.error('backupIfNeeded:', e && e.message); }

        res.json({ success: true });
    } catch (err) {
        console.error('api/save error:', err && err.message);
        res.status(500).json({ success: false, error: err && err.message || 'save failed' });
    }
};
