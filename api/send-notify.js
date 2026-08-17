module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const { to_email, to_emails, subject, html } = req.body || {};

    let emails = Array.isArray(to_emails) ? to_emails.slice() : [];
    if (to_email && emails.indexOf(to_email) === -1) emails.push(to_email);
    emails = emails.filter(e => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()));

    const unique = [];
    emails.forEach(e => { const t = e.trim(); if (unique.indexOf(t) === -1) unique.push(t); });

    if (!unique.length) return res.status(400).json({ success: false, error: 'No valid recipients' });
    if (!subject || !html) return res.status(400).json({ success: false, error: 'Missing subject/html' });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'RESEND_API_KEY not set' });

    let sent = 0;
    const errors = [];

    for (const email of unique) {
        try {
            const resp = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'Nexora <onboarding@resend.dev>',
                    to: [email],
                    subject,
                    html
                })
            });
            if (resp.ok) {
                sent++;
            } else {
                const data = await resp.json();
                errors.push(email + ': ' + (data.message || 'unknown'));
            }
        } catch (e) {
            errors.push(email + ': ' + e.message);
        }
    }

    res.json({ success: sent > 0, sent, errors: errors.length ? errors : undefined });
};
