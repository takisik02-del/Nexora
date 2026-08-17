module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const { to_email, to_name, code } = req.body || {};
    if (!to_email || !to_name || !code) {
        return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ success: false, error: 'RESEND_API_KEY not set' });
    }

    try {
        const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Nexora <onboarding@resend.dev>',
                to: [to_email],
                subject: 'Код подтверждения регистрации Nexora',
                html: `
                    <div style="background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;padding:32px;max-width:480px;margin:0 auto;border:1px solid #222;border-radius:12px">
                        <div style="text-align:center;margin-bottom:24px">
                            <span style="display:inline-block;background:#0A0B0E;color:#FFFFFF;width:32px;height:32px;line-height:30px;border-radius:8px;border:1px solid #D7DAE0;font-weight:700;font-size:14px">N</span>
                        </div>
                        <h1 style="color:#fff;font-size:18px;margin:0 0 8px">Привет, ${to_name}!</h1>
                        <p style="color:#a0a0a0;font-size:14px;margin:0 0 20px">Твой код для регистрации на Nexora:</p>
                        <div style="background:#111;border:1px solid #D7DAE0;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px">
                            <span style="font-size:32px;font-weight:700;color:#fff;letter-spacing:6px;font-family:monospace">${code}</span>
                        </div>
                        <p style="color:#666;font-size:11px;margin:0">Код действителен до завершения регистрации. Если ты не запрашивал код, просто проигнорируй это письмо.</p>
                        <hr style="border:none;border-top:1px solid #222;margin:20px 0">
                        <p style="color:#666;font-size:10px;text-align:center;margin:0">Nexora — Турнир где рождаются легенды</p>
                    </div>
                `
            })
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.message || JSON.stringify(data));

        res.json({ success: true });
    } catch (err) {
        console.error('Resend error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
