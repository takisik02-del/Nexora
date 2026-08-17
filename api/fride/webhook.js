// Nexora — POST /api/fride/webhook: уведомления об оплате от Fride.
// На статус-поллинг (api/fride/status.js) НЕ влияет — нужен только для
// Telegram-уведомления организатору о новой оплате.
//
// Подпись: HMAC-SHA256 (hex) от JSON верхнего уровня, ключи отсортированы
// (ksort), encode JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
// ключ подписи — FRIDE_API_KEY (секрет мерчанта).
// Заголовок с подписью ищем среди: x-signature / signature / x-hmac-sha256.
//
// ВСЕГДА отвечаем 200 быстро, даже если что-то упало.

const { list, get } = require('@vercel/blob');
const crypto = require('crypto');

const STORE_PREFIX = 'nexora/state.json';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-Signature, Signature, X-Hmac-Sha256');
}

async function readState() {
    try {
        const { blobs } = await list({ prefix: STORE_PREFIX });
        if (!blobs.length) return {};
        const blob = await get(blobs[0].url, { access: 'private', useCache: false });
        if (!blob || !blob.stream) return {};
        return await new Response(blob.stream).json();
    } catch (e) {
        console.error('webhook readState:', e && e.message);
        return {};
    }
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
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
        });
        if (!r.ok) console.error('telegram sendMessage:', r.status, (await r.text()).slice(0, 300));
    } catch (err) {
        console.error('telegram error:', err && err.message);
    }
}

// Кsort: рекурсивная сортировка ключей объектов (кастомные поля кастуем в объект,
// как того требует Fride).
function ksort(value) {
    if (Array.isArray(value)) return value.map(ksort);
    if (value && typeof value === 'object') {
        const out = {};
        Object.keys(value).sort().forEach(function (key) {
            out[key] = ksort(value[key]);
        });
        return out;
    }
    return value;
}

function verifySignature(body, signature, secret) {
    if (!signature || !secret) return false;
    try {
        const sorted = ksort(body);
        const json = JSON.stringify(sorted);
        const hmac = crypto.createHmac('sha256', secret).update(json).digest('hex');
        const a = hmac.replace(/^0x/i, '').toLowerCase();
        const b = String(signature).replace(/^0x/i, '').toLowerCase();
        return a === b;
    } catch (e) {
        console.error('webhook verify:', e && e.message);
        return false;
    }
}

module.exports = async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(200).json({ ok: true });

    const secret = process.env.FRIDE_API_KEY || '';
    const signature = (req.headers['x-signature'] || req.headers['signature'] || req.headers['x-hmac-sha256'] || '').toString();

    if (secret && signature && !verifySignature(req.body || {}, signature, secret)) {
        return res.status(403).json({ success: false, error: 'bad signature' });
    }

    try {
        const body = req.body || {};
        const status = String(body.status || (body.data && body.data.status) || '').toLowerCase();
        if (status === 'paid' || status === 'success' || status === 'successful' || status === 'completed') {
            const state = await readState();
            const settings = (state && state.nexora_settings) || {};
            const chatId = String(settings.telegram_chat_id || '').trim() || process.env.ADMIN_TG_CHAT_ID || '';
            if (chatId && TG_TOKEN) {
                const token = TG_TOKEN;
                const amount = Number(body.amount != null ? body.amount : (body.data && body.data.amount)) || 0;
                const orderId = body.order_id || body.id || (body.data && (body.data.order_id || body.data.id)) || '';
                await sendTelegram(token, chatId,
                    '💳 <b>Оплата во Fride</b>\n' +
                    'Сумма: ' + amount.toLocaleString('ru-RU') + ' ₽' +
                    (orderId ? '\nЗаказ: ' + tgEsc(orderId) : ''));
            }
        }
    } catch (e) {
        console.error('webhook process:', e && e.message);
    }

    res.json({ ok: true });
};
