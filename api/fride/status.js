// Nexora — GET /api/fride/status?id=<order_id>: статус счёта во Fride.
// Статус берём ЖИВЬЁМ из Fride (invoice/getInfo) — ничего не храним в blob,
// чтобы не конфликтовать с перезаписью nexora_payments в api/save.js.

const FRIDE_BASE = process.env.FRIDE_BASE || 'https://api.fride.io';

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
    res.setHeader('Cache-Control', 'no-store');
}

// Маппинг разных статусов Fride на наш единый статус. 'paid' — единственный,
// который мы считаем оплатой; всё остальное отдаём как есть (клиент покажет).
function mapStatus(raw, data) {
    const s = String(raw || '').toLowerCase();
    if (s === 'paid' || s === 'success' || s === 'successful' || s === 'confirmed' || s === 'completed' || s === 'payed') {
        return 'paid';
    }
    return raw || (data && data.status) || 'unknown';
}

module.exports = async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const merchantId = (process.env.FRIDE_MERCHANT_ID || '').trim();
    const apiKey = (process.env.FRIDE_API_KEY || '').trim();
    if (!merchantId || !apiKey) {
        return res.status(200).json({ success: false, error: 'FRIDE_NOT_CONFIGURED' });
    }

    const orderId = String((req.query && (req.query.id || req.query.order_id)) || '').trim();
    if (!orderId) return res.status(400).json({ success: false, error: 'id обязателен' });

    try {
        const qs = new URLSearchParams({
            merchant_id: merchantId,
            order_id: orderId
        });
        const frideResp = await fetch(FRIDE_BASE + '/invoice/getInfo?' + qs.toString(), {
            method: 'GET',
            headers: { 'X-Api-Key': apiKey }
        });

        let data = {};
        try { data = await frideResp.json(); } catch (e) { /* не JSON */ }

        if (!frideResp.ok) {
            const errTxt = (data && (data.error || data.message)) || ('HTTP ' + frideResp.status);
            return res.status(502).json({ success: false, error: 'Fride error: ' + errTxt });
        }

        // Поле статуса ищем защищённо: status, state, payment_status, data.status...
        const status = data.status || data.state || data.payment_status
            || (data.data && (data.data.status || data.data.state))
            || 'unknown';

        res.json({ success: true, status: mapStatus(status, data) });
    } catch (err) {
        console.error('api/fride/status error:', err && err.message);
        res.status(500).json({ success: false, error: err && err.message || 'status failed' });
    }
};
