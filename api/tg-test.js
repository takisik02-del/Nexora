// Nexora — GET /api/tg-test?chat_id=...: тестовое уведомление организатору в Telegram
// из админки (Настройки → «Проверить»). Токен бота берётся из переменной
// окружения TELEGRAM_BOT_TOKEN, с резервным значением из js/social-config.js.
const TG_TOKEN_DEFAULT = '8835168766:AAFSVqB4nmdhXaOR4MTZMYaz_LHH8j2haKk';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const chatId = String(req.query.chat_id || '').trim();
        if (!chatId) return res.json({ success: false, error: 'chat_id не указан' });
        const token = process.env.TELEGRAM_BOT_TOKEN || TG_TOKEN_DEFAULT;
        const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
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
    } catch (err) {
        res.status(500).json({ success: false, error: err && err.message || 'tg test failed' });
    }
};
