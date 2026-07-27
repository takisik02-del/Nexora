const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.mail.ru',
    port: 465,
    secure: true,
    auth: {
        user: 'marse2007@bk.ru',
        pass: process.env.SMTP_PASSWORD
    }
});

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { to_email, to_name, code } = req.body;

        if (!to_email || !to_name || !code) {
            return res.status(400).json({ success: false, error: 'Missing fields' });
        }

        await transporter.sendMail({
            from: '"Nexora" <marse2007@bk.ru>',
            to: to_email,
            subject: 'Код подтверждения регистрации Nexora',
            html: `
                <div style="background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;padding:32px;max-width:480px;margin:0 auto;border:1px solid #222;border-radius:12px">
                    <div style="text-align:center;margin-bottom:24px">
                        <span style="display:inline-block;background:#10B981;color:#fff;width:32px;height:32px;line-height:32px;border-radius:6px;font-weight:700;font-size:14px">N</span>
                    </div>
                    <h1 style="color:#fff;font-size:18px;margin:0 0 8px">Привет, ${to_name}!</h1>
                    <p style="color:#a0a0a0;font-size:14px;margin:0 0 20px">Твой код для регистрации на Nexora:</p>
                    <div style="background:#111;border:1px solid #10B981;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px">
                        <span style="font-size:32px;font-weight:700;color:#10B981;letter-spacing:6px;font-family:monospace">${code}</span>
                    </div>
                    <p style="color:#666;font-size:11px;margin:0">Код действителен до завершения регистрации. Если ты не запрашивал код, просто проигнорируй это письмо.</p>
                    <hr style="border:none;border-top:1px solid #222;margin:20px 0">
                    <p style="color:#666;font-size:10px;text-align:center;margin:0">Nexora — Турнир где рождаются легенды</p>
                </div>
            `
        });

        console.log('📧 Code sent to', to_email);
        res.json({ success: true });

    } catch (err) {
        console.error('❌ Send error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
