// Nexora — GET /api/load: отдать всё состояние nexora_* браузерам.
// Хранилище: Vercel Blob (переменная окружения BLOB_READ_WRITE_TOKEN).
const { list, get } = require('@vercel/blob');

const STORE_PREFIX = 'nexora/state.json';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { blobs } = await list({ prefix: STORE_PREFIX });
        if (!blobs.length) return res.json({});
        // useCache: false — читать актуальные данные с origin, а не устаревшую CDN-копию.
        const blob = await get(blobs[0].url, { access: 'private', useCache: false });
        if (!blob || !blob.stream) {
            return res.status(502).json({ success: false, error: 'store read failed' });
        }
        res.json(await new Response(blob.stream).json());
    } catch (err) {
        res.status(500).json({ success: false, error: err && err.message || 'load failed' });
    }
};
