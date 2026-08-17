const nodemailer = require('nodemailer');

// Отправитель по умолчанию — justxirrez@inbox.ru (рабочий пароль приложения SMS Light).
// Чтобы слать от marse2007@bk.ru, задайте SMTP_USER/SMTP_FROM на Vercel и поменяйте SMTP_PASSWORD
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
        const { to_email, to_emails, subject, html } = req.body;

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

        console.log('Notification sent to', sent, 'recipient(s)');
        res.json({ success: true, sent });

    } catch (err) {
        console.error('Notify error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
