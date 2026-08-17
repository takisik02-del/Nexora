// Nexora — POST /api/fride/create: создать платёжный счёт во Fride.
// Реальная оплата включена, когда в настройках nexora_settings.real_payments=true
// И на Vercel заданы FRIDE_MERCHANT_ID и FRIDE_API_KEY.
//
// Поток: клиент генерирует order_id (pay_<ts>_<rand>), шлёт сюда →
// создаём счёт во Fride → возвращаем payment_url (клиент откроет его в новой вкладке
// и будет опрашивать /api/fride/status).
//
// ВАЖНО: имя поля со ссылкой на оплату у Fride заранее не зафиксировано —
// парсим защищённо из любых вариантов (payment_url/url/link/invoice_url/pay_url/...).

const FRIDE_BASE = process.env.FRIDE_BASE || 'https://api.fride.io';

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
}

// Ищет ссылку на оплату в любом вложенном объекте/массиве по списку имён полей.
const URL_KEYS = ['payment_url', 'pay_url', 'invoice_url', 'redirect_url', 'checkout_url', 'url', 'link'];

function findPaymentUrl(node, depth) {
    if (depth > 6) return null;
    if (typeof node === 'string') {
        if (/^https?:\/\//i.test(node)) return node;
        return null;
    }
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            const found = findPaymentUrl(node[i], depth + 1);
            if (found) return found;
        }
        return null;
    }
    if (node && typeof node === 'object') {
        // Прямые ключи — в приоритете.
        for (const key of URL_KEYS) {
            const v = node[key];
            if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
        }
        // Затем рекурсивно по всем полям.
        for (const key of Object.keys(node)) {
            const found = findPaymentUrl(node[key], depth + 1);
            if (found) return found;
        }
    }
    return null;
}

module.exports = async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const merchantId = (process.env.FRIDE_MERCHANT_ID || '').trim();
    const apiKey = (process.env.FRIDE_API_KEY || '').trim();
    if (!merchantId || !apiKey) {
        // Клиент по этому коду падает в тестовый режим.
        return res.status(200).json({ success: false, error: 'FRIDE_NOT_CONFIGURED' });
    }

    const body = req.body || {};
    const orderId = String(body.order_id || '').trim();
    const amount = Number(body.amount);
    if (!orderId || !isFinite(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: 'order_id и amount обязательны' });
    }

    try {
        const payload = {
            merchant_id: merchantId,
            order_id: orderId,
            amount: amount,
            currency: String(body.currency || 'RUB')
        };
        if (body.comment) payload.comment = String(body.comment);
        if (body.success_url) payload.success_url = String(body.success_url);
        if (body.fail_url) payload.fail_url = String(body.fail_url);

        const frideResp = await fetch(FRIDE_BASE + '/invoices/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': apiKey
            },
            body: JSON.stringify(payload)
        });

        let data = {};
        try { data = await frideResp.json(); } catch (e) { /* не JSON — оставим пустым */ }

        if (!frideResp.ok) {
            const errTxt = (data && (data.error || data.message)) || ('HTTP ' + frideResp.status);
            return res.status(502).json({ success: false, error: 'Fride error: ' + errTxt });
        }

        const paymentUrl = findPaymentUrl(data, 0);
        if (!paymentUrl) {
            return res.status(502).json({
                success: false,
                error: 'Fride не вернул ссылку на оплату',
                raw: data
            });
        }

        res.json({ success: true, payment_url: paymentUrl, id: orderId });
    } catch (err) {
        console.error('api/fride/create error:', err && err.message);
        res.status(500).json({ success: false, error: err && err.message || 'create failed' });
    }
};
