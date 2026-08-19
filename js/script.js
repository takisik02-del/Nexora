/* ===================================================
   NEXORA — Scripts
   =================================================== */

// Глобальный обработчик ошибок — ловит необработанные исключения
// и показывает пользователю уведомление вместо молчаливого падения.
window.onerror = function(msg, url, line, col, err) {
    console.error('[Nexora Error]', msg, url + ':' + line);
    return false;
};
window.addEventListener('unhandledrejection', function(e) {
    console.error('[Nexora Unhandled Promise]', e.reason);
});

// Экранирование пользовательских строк перед вставкой в HTML (защита от XSS).
// Объявлена в глобальной области, чтобы её видели и DOMContentLoaded, и чат-IIFE.
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ===================================================
   Хеширование паролей (SHA-256)
   Пароли никогда не хранятся в открытом виде: на сервере
   и в localStorage лежит только 'sha256$' + hex(SHA-256).
   Старые открытые пароли поддерживаются через отложенную
   миграцию (passwordMatches + проверка при загрузке).
   =================================================== */

// SHA-256 в hex. Использует Web Crypto (доступен на https,
// localhost и file://); иначе — резервная реализация на чистом JS.
function sha256hex(str) {
    var text = String(str == null ? '' : str);
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
        return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function(buf) {
            var bytes = new Uint8Array(buf);
            var hex = '';
            for (var i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
            return hex;
        });
    }
    return Promise.resolve(sha256js(text));
}

// Резервная реализация SHA-256 (FIPS 180-4), чистый JS.
function sha256js(msg) {
    var bytes = new TextEncoder().encode(String(msg == null ? '' : msg));
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
             0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
             0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
             0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
             0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
             0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
             0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
             0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var i, l = bytes.length;
    var m = new Uint8Array((Math.floor((l + 9) / 64) + 1) * 64);
    m.set(bytes);
    m[l] = 0x80;
    var hi = Math.floor(l * 8 / 0x100000000);
    var lo = (l * 8) >>> 0;
    var last = m.length;
    m[last - 8] = (hi >>> 24) & 0xff; m[last - 7] = (hi >>> 16) & 0xff;
    m[last - 6] = (hi >>> 8) & 0xff;  m[last - 5] = hi & 0xff;
    m[last - 4] = (lo >>> 24) & 0xff; m[last - 3] = (lo >>> 16) & 0xff;
    m[last - 2] = (lo >>> 8) & 0xff;  m[last - 1] = lo & 0xff;
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
        h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    var w = new Uint32Array(64);
    function rotR(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var o = 0; o < m.length; o += 64) {
        for (i = 0; i < 16; i++) {
            w[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
        }
        for (i = 16; i < 64; i++) {
            w[i] = (w[i - 16] + (rotR(w[i - 15], 7) ^ rotR(w[i - 15], 18) ^ (w[i - 15] >>> 3))
                   + w[i - 7] + (rotR(w[i - 2], 17) ^ rotR(w[i - 2], 19) ^ (w[i - 2] >>> 10))) >>> 0;
        }
        var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (i = 0; i < 64; i++) {
            var S1 = rotR(e, 6) ^ rotR(e, 11) ^ rotR(e, 25);
            var ch = (e & f) ^ (~e & g);
            var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
            var S0 = rotR(a, 2) ^ rotR(a, 13) ^ rotR(a, 22);
            var maj = (a & b) ^ (a & c) ^ (b & c);
            var t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    var out = '';
    var hv = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (i = 0; i < 8; i++) out += ('00000000' + hv[i].toString(16)).slice(-8);
    return out;
}

// Хеш пароля в хранимом формате.
function hashPassword(pw) {
    return sha256hex(pw).then(function(hex) { return 'sha256$' + hex; });
}

// Проверка пароля против сохранённого значения.
// Поддерживает хеш ('sha256$...') и старый открытый формат (до миграции).
function passwordMatches(plain, stored) {
    if (stored && typeof stored === 'string' && stored.indexOf('sha256$') === 0) {
        return sha256hex(plain).then(function(hex) { return stored === 'sha256$' + hex; });
    }
    return Promise.resolve(plain === stored);
}

// ===========================================
// Email-уведомления участникам
// ===========================================

// Общий брендированный шаблон письма.
// lines — массив HTML-строк (параметры экранируются на стороне вызова).
function nexoraEmailBody(title, lines) {
    var content = (lines || []).map(function(l) {
        return '<p style="color:#a0a0a0;font-size:14px;margin:0 0 12px;line-height:1.6">' + l + '</p>';
    }).join('');
    return '<div style="background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;padding:32px;max-width:480px;margin:0 auto;border:1px solid #222;border-radius:12px">' +
        '<div style="text-align:center;margin-bottom:24px"><span style="display:inline-block;background:#FFFFFF;color:#0A0B0E;width:32px;height:32px;line-height:32px;border-radius:6px;font-weight:700;font-size:14px">N</span></div>' +
        '<h1 style="color:#fff;font-size:18px;margin:0 0 16px">' + title + '</h1>' + content +
        '<hr style="border:none;border-top:1px solid #222;margin:20px 0">' +
        '<p style="color:#666;font-size:10px;text-align:center;margin:0">Nexora — Турнир где рождаются легенды</p></div>';
}

// Отправка уведомления. toEmails: строка или массив email-адресов.
// Пытается Vercel API, затем /api/send-notify, затем локальный /send-notify.
function nexoraSendNotify(toEmails, subject, html) {
    var emails = Array.isArray(toEmails) ? toEmails.slice() : [toEmails];
    emails = emails.filter(function(e) { return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); });
    var unique = [];
    emails.forEach(function(e) { if (unique.indexOf(e) === -1) unique.push(e); });
    if (!unique.length) return Promise.resolve(false);

    var payload = { to_emails: unique, subject: subject, html: html };
    var urls = ['https://nexora-zeta-ten.vercel.app/api/send-notify', '/api/send-notify', '/send-notify'];

    function attempt(url) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function(r) { return r.json(); }).then(function(d) { return !!(d && d.success); })
          .catch(function() { return false; });
    }

    return urls.reduce(function(chain, url) {
        return chain.then(function(ok) { return ok ? true : attempt(url); });
    }, Promise.resolve(false));
}

// Emails всех участников по списку регистраций: ищет в nexora_users по никнейму/email,
// учитывает тиммейтов в командных регистрациях.
function nexoraParticipantEmails(regs) {
    var users = [];
    try { users = JSON.parse(localStorage.getItem('nexora_users')) || []; } catch {}
    var emails = [];
    function addEmail(userId) {
        if (!userId) return;
        var u = users.find(function(x) { return x.nickname === userId || x.email === userId; });
        var em = (u && u.email) || (String(userId).indexOf('@') !== -1 ? userId : null);
        if (em && emails.indexOf(em) === -1) emails.push(em);
    }
    (regs || []).forEach(function(r) {
        addEmail(r.userId);
        (r.teammates || []).forEach(function(tm) { addEmail(tm.nickname); });
    });
    return emails;
}

// ===========================================
// Оплата — реальная (Fride) / тестовый режим
// ===========================================
// Единая точка подключения платёжного провайдера.
// Реальная оплата через Fride включается настройкой
// nexora_settings.real_payments=true (админка) + ключами FRIDE_* на сервере.
// Без них createPayment() имитирует успешный платёж и логирует его в
// localStorage (nexora_payments) — деньги реально не списываются.
var nexoraPayment = (function() {
    var PAYMENTS_KEY = 'nexora_payments';

    var methods = [
        { id: 'card',   label: 'Банковская карта', hint: 'Visa / Mastercard / МИР' },
        { id: 'sbp',    label: 'СБП', hint: 'Оплата по QR-коду' },
        { id: 'wallet', label: 'Кошелёк Nexora', hint: 'Внутренний баланс' }
    ];

    // Fride-функции: сначала прод-домен, потом относительный путь (file:// не тянет).
    var CREATE_URLS = ['https://nexora-zeta-ten.vercel.app/api/fride/create', '/api/fride/create'];
    var STATUS_URLS = ['https://nexora-zeta-ten.vercel.app/api/fride/status', '/api/fride/status'];

    // Активный реальный платёж — для ручной проверки кнопкой «Я оплатил — проверить».
    var current = null; // { orderId, tab, finish, timer, amount, method, tournamentId, userId }

    function getPayments() {
        try { return JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || []; }
        catch (e) { return []; }
    }

    function addPayment(p) {
        var list = getPayments();
        list.push(p);
        try { localStorage.setItem(PAYMENTS_KEY, JSON.stringify(list)); } catch (e) {}
    }

    // Реальная оплата включена? Читаем nexora_settings.real_payments.
    function isRealEnabled() {
        try {
            var s = JSON.parse(localStorage.getItem('nexora_settings')) || {};
            return s.real_payments === true;
        } catch (e) { return false; }
    }

    function attempt(url, options) {
        return fetch(url, options).then(function(r) { return r.json(); }).catch(function() { return null; });
    }

    // Пробуем URL по очереди, пока не получим валидный ответ.
    function firstSuccess(urls, options) {
        return urls.reduce(function(chain, url) {
            return chain.then(function(d) { return d || attempt(url, options); });
        }, Promise.resolve(null));
    }

    function fetchStatus(orderId) {
        var urls = STATUS_URLS.map(function(u) { return u + '?id=' + encodeURIComponent(orderId); });
        return firstSuccess(urls, { cache: 'no-store' });
    }

    function fetchCreate(payload) {
        return firstSuccess(CREATE_URLS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    // Тестовый платёж (деньги не списываются). fallback=true — реальный режим был
    // включён, но Fride не настроен/недоступен, поэтому тихо упали в тест.
    function makeTestPayment(opts, orderId, fallback) {
        return {
            id: orderId || ('pay_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4)),
            userId: (opts && opts.userId) || null,
            tournamentId: (opts && opts.tournamentId) || null,
            amount: Number(opts && opts.amount) || 0,
            method: (opts && opts.method) || 'card',
            status: 'paid',
            test: true,
            fallback: !!fallback,
            date: new Date().toISOString()
        };
    }

    function testCreate(opts) {
        var orderId = 'pay_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);
        var p = makeTestPayment(opts, orderId, false);
        return new Promise(function(resolve) {
            setTimeout(function() {
                addPayment(p);
                resolve(p);
            }, 900); // имитация обработки платежа
        });
    }

    // РЕАЛЬНЫЙ РЕЖИМ. Создаём счёт во Fride, открываем вкладку, поллим статус.
    function realCreate(opts) {
        var amount = Number(opts && opts.amount) || 0;
        var method = (opts && opts.method) || 'card';
        var orderId = 'pay_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);

        // Открываем пустую вкладку СИНХРОННО (до любых await) — иначе popup-blocker.
        var tab = null;
        try { tab = window.open('', '_blank'); } catch (e) { tab = null; }

        return new Promise(function(resolve) {
            var done = false;
            var timer = null;
            var ctx = {
                orderId: orderId,
                tab: tab,
                amount: amount,
                method: method,
                tournamentId: (opts && opts.tournamentId) || null,
                userId: (opts && opts.userId) || null
            };

            function makeResult(status) {
                return {
                    id: orderId,
                    userId: ctx.userId,
                    tournamentId: ctx.tournamentId,
                    amount: amount,
                    method: method,
                    status: status,
                    test: false,
                    date: new Date().toISOString()
                };
            }

            function finish(p) {
                if (done) return;
                done = true;
                if (timer) { clearInterval(timer); timer = null; }
                if (current === ctx) current = null;
                if (p.status === 'paid') addPayment(p);
                resolve(p);
            }

            ctx.finish = finish;
            current = ctx;

            fetchCreate({
                order_id: orderId,
                amount: amount,
                currency: 'RUB',
                method: method,
                success_url: window.location.href,
                fail_url: window.location.href
            }).then(function(d) {
                if (!d || !d.success || !d.payment_url) {
                    // Fride не настроен или не вернул ссылку → фолбэк в тестовый режим.
                    if (tab) { try { tab.close(); } catch (e) {} }
                    finish(makeTestPayment(opts, orderId, true));
                    return;
                }
                if (tab) { try { tab.location.href = d.payment_url; } catch (e) {} }
                // Поллинг статуса каждые 3 сек, максимум 120 попыток (~6 минут).
                var tries = 0;
                timer = setInterval(function() {
                    tries++;
                    fetchStatus(orderId).then(function(sd) {
                        if (done) return;
                        if (!sd || !sd.success) return; // сеть/сервер — продолжаем ждать
                        if (sd.status === 'paid') {
                            finish(makeResult('paid'));
                        } else if (tries >= 120) {
                            finish(makeResult('cancelled'));
                        }
                    });
                }, 3000);
            }).catch(function() {
                if (tab) { try { tab.close(); } catch (e) {} }
                finish(makeTestPayment(opts, orderId, true));
            });
        });
    }

    // Ручная проверка «Я оплатил — проверить»: опрашивает статус текущего счёта,
    // при paid завершает платёж и возвращает {paid:true}.
    function forceCheck() {
        var ctx = current;
        if (!ctx || !ctx.orderId) return Promise.resolve({ paid: false, status: 'none' });
        return fetchStatus(ctx.orderId).then(function(d) {
            var status = (d && d.status) || 'unknown';
            if (d && d.success && status === 'paid') {
                var p = {
                    id: ctx.orderId,
                    userId: ctx.userId,
                    tournamentId: ctx.tournamentId,
                    amount: ctx.amount,
                    method: ctx.method,
                    status: 'paid',
                    test: false,
                    date: new Date().toISOString()
                };
                if (ctx.finish) ctx.finish(p);
                return { paid: true, status: status };
            }
            return { paid: false, status: status };
        }).catch(function() { return { paid: false, status: 'error' }; });
    }

    function createPayment(opts) {
        if (isRealEnabled()) return realCreate(opts);
        return testCreate(opts);
    }

    return { methods: methods, createPayment: createPayment, getPayments: getPayments, isRealEnabled: isRealEnabled, forceCheck: forceCheck };
})();

document.addEventListener('DOMContentLoaded', () => {

    'use strict';

    // ===========================================
    // Автономный режим file:// — если браузер открыл страницу файлом
    // и в localStorage пусто, подставляем демо-данные (те же, что на сервере),
    // чтобы турнир, вход и чат работали без запущенного сервера.
    // ===========================================
    function seedFileMode() {
        if (window.location.protocol !== 'file:') return;
        var changed = false;
        function isEmpty(key) {
            try {
                var v = localStorage.getItem(key);
                if (v === null) return true;
                var a = JSON.parse(v);
                return !a || (Array.isArray(a) && a.length === 0);
            } catch(e) { return true; }
        }
        if (isEmpty('nexora_tournaments')) {
            localStorage.setItem('nexora_tournaments', JSON.stringify([
                { id: 1, name: 'Nexora Open S1', game: 'CS2', players: '32 команды', prize: 50000, fee: 500, format: 'BO3', teamType: 'team', status: 'active', date: '10.08.2026' }
            ]));
            changed = true;
        }
        if (isEmpty('nexora_users')) {
            localStorage.setItem('nexora_users', JSON.stringify([
                { nickname: 'Taki', email: 'anfajue@bk.ru', password: 'sha256$79a09ccd71918f2220aa651aa66bb060e66df51d91aaa8a01de8e75be473e69c', registeredAt: '2026-07-30T16:51:51.654Z' },
                { nickname: 'MARS', email: 'marse2007@bk.ru', password: 'sha256$79a09ccd71918f2220aa651aa66bb060e66df51d91aaa8a01de8e75be473e69c', registeredAt: '2026-07-30T16:53:18.524Z' },
                { nickname: 'S', email: 'ws.iao.07@mail.ru', password: 'sha256$79a09ccd71918f2220aa651aa66bb060e66df51d91aaa8a01de8e75be473e69c', registeredAt: '2026-07-30T17:44:05.156Z' },
                { nickname: 'Support', email: 'support@nexora.gg', password: 'sha256$79a09ccd71918f2220aa651aa66bb060e66df51d91aaa8a01de8e75be473e69c', registeredAt: '2026-08-17T13:00:00.000Z' }
            ]));
            changed = true;
        }
        if (isEmpty('nexora_profiles')) {
            localStorage.setItem('nexora_profiles', JSON.stringify({ MARS: { avatar: '', bgColor: '#14B8A6', bio: '', avatarImage: null, wins: 0, losses: 0 } }));
            changed = true;
        }
        if (isEmpty('nexora_registrations')) {
            localStorage.setItem('nexora_registrations', JSON.stringify([
                { userId: 'MARS', tournamentId: 1, playerId: '21213', date: '2026-07-30T18:38:38.338Z', teamId: 'team_ms7uw4ta_ye78', teamName: 'чуваки', role: 'captain', paid: true, paidAt: '2026-07-30T18:38:38.338Z', teammates: [{ nickname: 'Taki', playerId: '1421321' }] },
                { userId: 'Taki', tournamentId: 1, playerId: '1421321', date: '2026-07-30T18:39:47.155Z', teamId: 'team_ms7uw4ta_ye78', teamName: 'чуваки', role: 'member', paid: true, paidAt: '2026-07-30T18:39:47.155Z' }
            ]));
            changed = true;
        }
        if (isEmpty('nexora_roles')) {
            localStorage.setItem('nexora_roles', JSON.stringify({ MARS: 'organizer' }));
            changed = true;
        }
    }
    seedFileMode();

    // Миграция: удаление standalone «PUBG» турниров из localStorage
    (function migrateRemoveStandalonePubg() {
        try {
            var t = JSON.parse(localStorage.getItem('nexora_tournaments'));
            if (Array.isArray(t)) {
                var filtered = t.filter(function(x) { return x && x.game && x.game !== 'PUBG'; });
                if (filtered.length !== t.length) {
                    localStorage.setItem('nexora_tournaments', JSON.stringify(filtered));
                }
            }
        } catch(e) {}
    })();

    // Миграция: удаление registrations для несуществующих турниров
    (function migrateCleanOrphanRegistrations() {
        try {
            var tours = JSON.parse(localStorage.getItem('nexora_tournaments')) || [];
            var tourIds = {};
            tours.forEach(function(t) { tourIds[t.id] = true; });
            var regs = JSON.parse(localStorage.getItem('nexora_registrations')) || [];
            var cleaned = regs.filter(function(r) { return tourIds[r.tournamentId]; });
            if (cleaned.length !== regs.length) {
                localStorage.setItem('nexora_registrations', JSON.stringify(cleaned));
            }
            var left = JSON.parse(localStorage.getItem('nexora_left_tournaments')) || [];
            var cleanedLeft = left.filter(function(r) { return tourIds[r.tournamentId]; });
            if (cleanedLeft.length !== left.length) {
                localStorage.setItem('nexora_left_tournaments', JSON.stringify(cleanedLeft));
            }
        } catch(e) {}
    })();

    // Nexora mail API endpoint (Vercel)
    const MAIL_API = 'https://nexora-zeta-ten.vercel.app/api/send-code';

    // ===========================================
    // Фоновая миграция старых открытых паролей → SHA-256
    // (выполняется один раз при загрузке, идемпотентна)
    // ===========================================
    (async function migrateLegacyPasswords() {
        try {
            const users = getUsers();
            let usersChanged = false;
            for (const u of users) {
                if (u && typeof u.password === 'string' && u.password.length > 0 && u.password.indexOf('sha256$') !== 0) {
                    u.password = await hashPassword(u.password);
                    usersChanged = true;
                }
            }
            if (usersChanged) saveUsers(users);

            const pend = getPendingRegistrations();
            let pendChanged = false;
            for (const p of pend) {
                if (p && typeof p.password === 'string' && p.password.length > 0 && p.password.indexOf('sha256$') !== 0) {
                    p.password = await hashPassword(p.password);
                    pendChanged = true;
                }
            }
            if (pendChanged) savePendingRegistrations(pend);
        } catch (e) { /* миграция не критична — проверка при логине тоже сработает */ }
    })();

    // ===========================================
    // 1. REVEAL ON SCROLL
    // ===========================================
    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // ===========================================
    // 2. HEADER
    // ===========================================
    const header = document.getElementById('header');
    window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });

    // ===========================================
    // 3. BURGER
    // ===========================================
    const burger = document.getElementById('burger');
    const nav = document.getElementById('nav');
    burger.addEventListener('click', () => {
        burger.classList.toggle('active');
        nav.classList.toggle('open');
    });
    document.querySelectorAll('.nav__link').forEach(link => {
        link.addEventListener('click', () => {
            burger.classList.remove('active');
            nav.classList.remove('open');
        });
    });

    // ===========================================
    // 4. NAV ACTIVE LINK
    // ===========================================
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav__link');
    function updateNav() {
        var hasVisible = false;
        sections.forEach(function(sec) {
            if (getComputedStyle(sec).display !== 'none') hasVisible = true;
        });
        if (!hasVisible) return;
        var current = 'hero';
        sections.forEach(function(sec) {
            var d = getComputedStyle(sec).display;
            if (d === 'none') return;
            if (window.scrollY >= sec.offsetTop - 150) current = sec.id;
        });
        navLinks.forEach(function(l) {
            l.classList.toggle('active', l.getAttribute('href') === '#' + current);
        });
    }
    window.addEventListener('scroll', updateNav, { passive: true });
    setTimeout(updateNav, 50);

    // ===========================================
    // 5. MODALS
    // ===========================================
    const overlay = document.getElementById('modal-overlay');
    const modals = {
        login: document.getElementById('login-modal'),
        register: document.getElementById('register-modal')
    };
    let activeModal = null;

    function openModal(id) {
        if (activeModal) closeModal();
        const modal = modals[id];
        if (!modal) return;
        activeModal = modal;
        overlay.classList.add('active');
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        // Clear any previous error messages
        modal.querySelectorAll('.form-error').forEach(el => el.remove());
        // Reset profile modal to stats tab on open
        if (id === 'profile') {
            const tabs = modal.querySelectorAll('.profile-tab');
            const contents = modal.querySelectorAll('.profile-content');
            tabs.forEach(t => t.classList.toggle('active', t.dataset.profileTab === 'stats'));
            contents.forEach(c => c.classList.toggle('active', c.id === 'profile-content-stats'));
        }
    }
    function closeModal() {
        if (!activeModal) return;
        overlay.classList.remove('active');
        activeModal.classList.remove('active');
        activeModal = null;
        document.body.style.overflow = '';
        // Reset registration step if in verification mode
        if (typeof registerStep !== 'undefined' && registerStep !== 1) {
            registerStep = 1;
            pendingReg = null;
            const verif = registerForm?.querySelector('.reg-verification');
            if (verif) verif.remove();
            registerForm?.querySelectorAll('.form-group, .form-agree').forEach(el => el.style.display = '');
            // Reset submit button if it was in loading state
            const btn = registerForm?.querySelector('[type="submit"]');
            if (btn && btn.disabled) { btn.textContent = 'Создать аккаунт'; btn.disabled = false; }
        }
    }

    document.querySelectorAll('[data-modal]').forEach(btn => {
        btn.addEventListener('click', e => { e.preventDefault(); openModal(btn.dataset.modal); });
    });
    overlay.addEventListener('click', closeModal);
    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
    document.querySelectorAll('[data-switch-modal]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            closeModal();
            setTimeout(() => openModal(link.dataset.switchModal), 200);
        });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    // ===========================================
    // 6. FORMS + AUTH
    // ===========================================
    let isLoggedIn = false;
    let currentUser = null;
    const btnRegister = document.getElementById('btn-register');
    const btnLogin = document.getElementById('btn-login');
    const profileWrap = document.getElementById('profile-wrap');
    const btnProfile = document.getElementById('btn-profile');
    const profileDropdown = document.getElementById('profile-dropdown');
    const profileInfo = document.getElementById('profile-info');
    const adminLink = document.getElementById('admin-link');
    const btnLogout = document.getElementById('btn-logout');

    function getUsers() {
        try { return JSON.parse(localStorage.getItem('nexora_users')) || []; }
        catch { return []; }
    }

    function saveUsers(users) {
        localStorage.setItem('nexora_users', JSON.stringify(users));
    }

    function showFormError(form, msg) {
        const existing = form.querySelector('.form-error');
        if (existing) existing.remove();
        const el = document.createElement('p');
        el.className = 'form-error';
        el.style.cssText = 'color:var(--accent);font-size:12px;margin-bottom:14px;font-weight:500';
        el.textContent = '⤫ ' + msg;
        form.querySelector('[type="submit"]').before(el);
    }

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function updateAuthUI() {
        btnRegister.style.display = isLoggedIn ? 'none' : '';
        btnLogin.style.display = isLoggedIn ? 'none' : '';
        profileWrap.style.display = isLoggedIn ? '' : 'none';
        if (isLoggedIn && currentUser) {
            profileInfo.textContent = currentUser.nickname || currentUser.email;
            if (adminLink) {
                // Check roles for admin panel access
                let userRole = '';
                try {
                    const roles = JSON.parse(localStorage.getItem('nexora_roles')) || {};
                    if (currentUser.nickname === 'Taki') userRole = 'admin';
                    else if (currentUser.email === 'anfajue@bk.ru') userRole = 'admin';
                    else if (roles[currentUser.nickname]) userRole = roles[currentUser.nickname];
                } catch {}
                adminLink.style.display = userRole ? '' : 'none';
            }
        }
        // Сообщаем чат-модулю, что изменился статус авторизации (обновить видимость кнопки чата)
        try { window.dispatchEvent(new CustomEvent('nexora:auth')); } catch(e) {}

        // На главной: авторизованному игроку не нужна кнопка «Присоединиться» (регистрация),
        // вместо неё показываем «Турниры»
        const joinBtn = document.querySelector('.hero__cta [data-modal="register"]');
        if (joinBtn) {
            const parent = joinBtn.parentNode;
            let toursBtn = parent.querySelector('.btn--tours-link');
            if (isLoggedIn) {
                joinBtn.style.display = 'none';
                if (!toursBtn) {
                    toursBtn = document.createElement('a');
                    toursBtn.href = 'tournaments.html';
                    toursBtn.className = 'btn btn--outline btn--lg btn--tours-link';
                    toursBtn.textContent = 'Турниры';
                    parent.insertBefore(toursBtn, joinBtn.nextSibling);
                }
                toursBtn.style.display = '';
            } else {
                joinBtn.style.display = '';
                if (toursBtn) toursBtn.style.display = 'none';
            }
        }
    }

    // Profile dropdown toggle
    btnProfile.addEventListener('click', e => {
        e.stopPropagation();
        profileDropdown.classList.toggle('open');
    });

    // Close dropdown on outside click
    document.addEventListener('click', e => {
        if (!profileWrap.contains(e.target)) {
            profileDropdown.classList.remove('open');
        }
    });

    // --- REGISTER (two-step email verification) ---
    const registerForm = document.getElementById('register-form');
    let registerStep = 1;
    let pendingReg = null;

    function generateCode() {
        let code = '';
        const chars = '0123456789';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    function getPendingRegistrations() {
        try { return JSON.parse(localStorage.getItem('nexora_pending_regs')) || []; } catch { return []; }
    }

    function savePendingRegistrations(list) {
        localStorage.setItem('nexora_pending_regs', JSON.stringify(list));
    }

    function showVerificationUI(devCode) {
        registerStep = 2;
        registerForm.querySelectorAll('.form-group, .form-agree').forEach(el => el.style.display = 'none');
        const existingVerification = registerForm.querySelector('.reg-verification');
        if (existingVerification) existingVerification.remove();

        const verification = document.createElement('div');
        verification.className = 'reg-verification';
        verification.style.cssText = 'text-align:center;padding:8px 0';
        verification.innerHTML = `
            <div style="width:48px;height:48px;border-radius:50%;background:var(--accent-dim);display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <p style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">Код отправлен на вашу почту</p>
            <p style="font-size:11px;color:var(--text-muted);margin-bottom:16px">Проверьте папку «Входящие» или «Спам»</p>
            ${devCode ? '<div style="background:rgba(245,158,11,.1);border:1px dashed rgba(245,158,11,.4);border-radius:8px;padding:10px 14px;margin:0 auto 16px;max-width:280px"><div style="font-size:11px;color:#f59e0b;margin-bottom:4px;font-weight:600">⚠️ Письмо не отправлено (SMTP не настроен). Ваш код:</div><div style="font-size:26px;font-weight:700;letter-spacing:6px;color:#f59e0b;font-family:var(--font-mono)">' + esc(devCode) + '</div></div>' : ''}
            <div class="form-group" style="max-width:200px;margin:0 auto 16px">
                <label class="form-label">Введите код из письма</label>
                <input type="text" class="form-input" id="reg-verify-code" placeholder="000000" maxlength="6" style="text-align:center;font-size:20px;font-weight:700;letter-spacing:4px;font-family:var(--font-mono)">
            </div>
            <button type="submit" class="btn btn--primary btn--full">Подтвердить регистрацию</button>
        `;
        registerForm.appendChild(verification);
        setTimeout(() => document.getElementById('reg-verify-code')?.focus(), 100);
    }

    registerForm.addEventListener('submit', async e => {
        e.preventDefault();
        const nick = registerForm.querySelector('input[placeholder="NightHawk"]');
        const email = registerForm.querySelector('input[type="email"]');
        const pass = document.getElementById('reg-pass');
        const confirm = document.getElementById('reg-pass-confirm');

        // STEP 1 — validate and generate code
        if (registerStep === 1) {
            if (!nick.value.trim() || !email.value.trim() || !pass.value || !confirm.value) {
                showFormError(registerForm, 'Заполните все поля');
                return;
            }
            if (pass.value !== confirm.value) {
                showFormError(registerForm, 'Пароли не совпадают');
                return;
            }
            if (pass.value.length < 4) {
                showFormError(registerForm, 'Пароль должен быть минимум 4 символа');
                return;
            }
            if (!validateEmail(email.value.trim())) {
                showFormError(registerForm, 'Введите корректный email (например: name@domain.com)');
                return;
            }

            const users = getUsers();
            if (users.find(u => u.email === email.value.trim())) {
                showFormError(registerForm, 'Этот email уже зарегистрирован');
                return;
            }
            if (users.find(u => u.nickname === nick.value.trim())) {
                showFormError(registerForm, 'Этот никнейм уже занят');
                return;
            }

            // Generate one-time code and save pending
            const code = generateCode();
            const passwordHash = await hashPassword(pass.value);
            pendingReg = {
                nickname: nick.value.trim(),
                email: email.value.trim(),
                password: passwordHash,
                code: code,
                createdAt: new Date().toISOString()
            };

            // Save to pending list (admin can see)
            const pendingList = getPendingRegistrations();
            pendingList.push(pendingReg);
            savePendingRegistrations(pendingList);

            // Show loading state
            const submitBtn = registerForm.querySelector('[type="submit"]');
            const origText = submitBtn.textContent;
            submitBtn.textContent = '⏳ Отправка...';
            submitBtn.disabled = true;

            // Send email via our API
            fetch(MAIL_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to_email: pendingReg.email,
                    to_name: pendingReg.nickname,
                    code: pendingReg.code
                })
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    submitBtn.textContent = origText;
                    submitBtn.disabled = false;
                    showVerificationUI();
                } else {
                    throw new Error(data.error || 'Unknown error');
                }
            }).catch(err => {
                console.error('Mail API error:', err);
                submitBtn.textContent = origText;
                submitBtn.disabled = false;
                // Письмо не ушло (SMTP не настроен/неверный пароль) — показываем код прямо
                // в модалке, чтобы регистрацию можно было завершить без почты (демо-режим).
                if (pendingReg && pendingReg.code) {
                    showVerificationUI(pendingReg.code);
                } else {
                    showFormError(registerForm, 'Ошибка отправки письма. Проверьте SMTP_PASSWORD в Vercel');
                    const list = getPendingRegistrations();
                    savePendingRegistrations(list.filter(p => p.email !== pendingReg.email));
                    pendingReg = null;
                }
            });
            return;
        }

        // STEP 2 — verify code
        if (registerStep === 2) {
            const codeInput = document.getElementById('reg-verify-code');
            if (!codeInput || !codeInput.value.trim()) {
                showFormError(registerForm, 'Введите код из письма');
                return;
            }

            if (!pendingReg || codeInput.value.trim() !== pendingReg.code) {
                showFormError(registerForm, 'Неверный код. Попробуйте ещё раз');
                return;
            }

            // Remove from pending list
            const pendingList = getPendingRegistrations();
            const filtered = pendingList.filter(p => p.email !== pendingReg.email);
            savePendingRegistrations(filtered);

            // Create account
            const users = getUsers();
            currentUser = { nickname: pendingReg.nickname, email: pendingReg.email, password: pendingReg.password, registeredAt: new Date().toISOString() };
            users.push(currentUser);
            saveUsers(users);
            localStorage.setItem('nexora_current_user', JSON.stringify(currentUser));

            const btn = registerForm.querySelector('[type="submit"]');
            const orig = btn.textContent;
            btn.textContent = 'Готово';
            btn.disabled = true;
            setTimeout(() => {
                btn.textContent = orig;
                btn.disabled = false;
                isLoggedIn = true;
                updateAuthUI();
                closeModal();
                registerStep = 1;
                pendingReg = null;
                // Reset form
                registerForm.querySelectorAll('.form-group, .form-agree').forEach(el => el.style.display = '');
                const verif = registerForm.querySelector('.reg-verification');
                if (verif) verif.remove();
                registerForm.querySelectorAll('.form-error').forEach(el => el.remove());
            }, 600);
        }
    });

    // Reset step when modal is closed
    document.querySelectorAll('[data-close-modal], [data-switch-modal]').forEach(el => {
        el.addEventListener('click', () => {
            if (registerStep !== 1) {
                registerStep = 1;
                pendingReg = null;
                const verif = registerForm.querySelector('.reg-verification');
                if (verif) verif.remove();
                registerForm.querySelectorAll('.form-group, .form-agree').forEach(el => el.style.display = '');
            }
        });
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && registerStep !== 1) {
            registerStep = 1;
            pendingReg = null;
            const verif = registerForm.querySelector('.reg-verification');
            if (verif) verif.remove();
            registerForm.querySelectorAll('.form-group, .form-agree').forEach(el => el.style.display = '');
        }
    });

    // --- LOGIN ---
    document.getElementById('login-form').addEventListener('submit', async e => {
        e.preventDefault();
        const loginField = e.target.querySelector('input[type="text"]');
        const passField = document.getElementById('login-pass');

        if (!loginField.value.trim() || !passField.value) {
            showFormError(e.target, 'Заполните все поля');
            return;
        }

        // If input looks like an email, validate the format
        const loginValue = loginField.value.trim();
        if (loginValue.includes('@') && !validateEmail(loginValue)) {
            showFormError(e.target, 'Введите корректный email или никнейм');
            return;
        }

        const users = getUsers();
        const user = users.find(u => (u.email === loginValue || u.nickname === loginValue));

        if (!user) {
            showFormError(e.target, 'Неверный email/никнейм или пароль');
            return;
        }

        // Проверка пароля по хешу (или старому открытому формату до миграции)
        if (!await passwordMatches(passField.value, user.password)) {
            showFormError(e.target, 'Неверный email/никнейм или пароль');
            return;
        }

        // Отложенная миграция: старый открытый пароль → хеш
        if (typeof user.password === 'string' && user.password.indexOf('sha256$') !== 0) {
            user.password = await hashPassword(passField.value);
            saveUsers(users);
        }

        currentUser = user;
        localStorage.setItem('nexora_current_user', JSON.stringify(currentUser));
        const btn = e.target.querySelector('[type="submit"]');
        const orig = btn.textContent;
        btn.textContent = 'Готово';
        btn.disabled = true;
        setTimeout(() => {
            btn.textContent = orig;
            btn.disabled = false;
            isLoggedIn = true;
            updateAuthUI();
            closeModal();
        }, 600);
    });

    // ===========================================
    // 6b. ВХОД ЧЕРЕЗ СОЦСЕТИ (Telegram / Google)
    // ===========================================
    // Чтобы включить провайдера:
    //  • Telegram — создайте бота у @BotFather. Впишите его юзернейм (без @)
    //    в SOCIAL_CONFIG.telegram.botName. Токен бота (botToken) нужен для
    //    проверки подписи; возьмите его там же. Оставите пустым — подпись
    //    не проверяется (демо-режим).
    //  • Google — OAuth-клиент в Google Cloud Console (console.cloud.google.com
    //    → APIs & Services → Credentials → OAuth client ID → Web). Впишите clientId
    //    и добавьте свой домен в список Authorized JavaScript origins.
    // Конфиг берётся из js/social-config.js (window.NEXORA_SOCIAL_CONFIG),
    // чтобы менять ключи было легко и не копаясь в логике. Дефолты — пустые.
    var __sc = window.NEXORA_SOCIAL_CONFIG || {};
    var SOCIAL_CONFIG = {
        telegram: Object.assign({ enabled: true, botName: '', botToken: '' }, __sc.telegram || {}),
        google:   Object.assign({ enabled: true, clientId: '' }, __sc.google || {})
    };

    // Предзагрузка Google Identity Services при старте страницы — чтобы окно
    // выбора аккаунта открывалось сразу по клику (SDK уже загружен, а сам
    // клик остаётся доверенным, и всплывающее окно не блокируется браузером).
    (function preloadGsi() {
        if (window.google && window.google.accounts) return;
        var s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        document.head.appendChild(s);
    })();

    function hexToBytes(hex) {
        const out = new Uint8Array(hex.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
        return out;
    }
    function bytesToHex(bytes) {
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
        return s;
    }
    // Декодирует payload JWT (base64url → JSON). Используется для Google credential.
    function base64UrlDecodeJson(token) {
        try {
            const part = token.split('.')[1];
            const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return JSON.parse(new TextDecoder('utf-8').decode(bytes));
        } catch (e) { return null; }
    }
    async function hmacSha256Hex(keyBytes, data) {
        const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
        return bytesToHex(new Uint8Array(sig));
    }

    // Вход или создание пользователя из данных соцсети.
    // profile: { id, name, email, avatar }
    async function socialLogin(provider, profile) {
        if (!profile || !profile.id) { alert('Не удалось получить данные профиля'); return; }
        const users = getUsers();
        const key = provider + ':' + String(profile.id);
        let user = users.find(u => u.social && u.social.key === key);
        // Если аккаунт с таким email уже есть — привязываем соцсеть к нему
        if (!user && profile.email && profile.email.indexOf('@') !== -1) {
            user = users.find(u => u.email === profile.email);
            if (user) { user.social = { provider: provider, key: key }; saveUsers(users); }
        }
        // Желаемый ник: @ник (username) из соцсети, иначе — имя
        const wantNick = String(profile.username || profile.name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
        // Есть ли у пользователя записи на турниры (если да — ник менять нельзя, разорвётся привязка)
        const hasRegs = (() => {
            try {
                return JSON.parse(localStorage.getItem('nexora_registrations') || '[]')
                    .some(r => user && (r.userId === user.nickname || r.userId === user.email));
            } catch { return false; }
    })();

    // Миграция: добавление/обновление аккаунта Support в localStorage
    (function migrateAddSupportAccount() {
        try {
            var users = JSON.parse(localStorage.getItem('nexora_users'));
            if (!Array.isArray(users)) return;
            var support = users.find(function(u) { return u && u.email === 'support@nexora.gg'; });
            var correctHash = 'sha256$79a09ccd71918f2220aa651aa66bb060e66df51d91aaa8a01de8e75be473e69c';
            if (!support) {
                users.push({ nickname: 'Support', email: 'support@nexora.gg', password: correctHash, registeredAt: '2026-08-17T13:00:00.000Z' });
                localStorage.setItem('nexora_users', JSON.stringify(users));
            } else if (support.password !== correctHash) {
                support.password = correctHash;
                localStorage.setItem('nexora_users', JSON.stringify(users));
            }
        } catch(e) {}
    })();
        if (!user) {
            // Новый пользователь: ник из @ника соцсети (или имени), при занятости — суффикс
            let nick = wantNick || provider + '_user';
            const taken = users.map(u => u.nickname);
            if (taken.indexOf(nick) !== -1) {
                let i = 2;
                while (taken.indexOf(nick + '_' + i) !== -1) i++;
                nick = nick + '_' + i;
            }
            const email = (profile.email && profile.email.indexOf('@') !== -1) ? profile.email : provider + ':' + profile.id + '@nexora.social';
            user = {
                nickname: nick,
                email: email,
                password: 'social$' + key, // при соцвходе пароль не используется
                social: { provider: provider, key: key, username: profile.username || '' },
                registeredAt: new Date().toISOString()
            };
            users.push(user);
            saveUsers(users);
        } else if (user.social && user.social.key === key && wantNick && user.nickname !== wantNick && !hasRegs) {
            // Соцаккаунт уже есть: обновляем ник на актуальный из соцсети
            // (но только пока у игрока нет записей на турниры)
            const free = users.every(u => u.nickname !== wantNick || u === user);
            if (free) {
                user.nickname = wantNick;
                user.social.username = profile.username || '';
                saveUsers(users);
            }
        }
        currentUser = user;
        localStorage.setItem('nexora_current_user', JSON.stringify(currentUser));
        isLoggedIn = true;
        updateAuthUI();
        closeModal();
    }

    // --- Telegram (вход через бота) ---
    // По клику на кнопку сразу открывается t.me/<bot>?start=LOGIN_<код> —
    // без виджета и лишних шагов. Сервер (локально server/server.js на :3001,
    // на проде Vercel-функция /api/tg-check) ловит /start от бота вместе с
    // профилем, а эта функция опрашивает /api/tg-check и завершает вход.
    function startTgCodeLogin(box) {
        const cfg = SOCIAL_CONFIG.telegram;
        if (!cfg.enabled) { box.innerHTML = '<p class="social-auth__note">Telegram-вход отключён в настройках (js/social-config.js).</p>'; return; }
        if (!cfg.botName) {
            box.innerHTML = '<p class="social-auth__note">Telegram-бот не настроен.<br>Впишите <b>botName</b> в js/social-config.js.</p>';
            return;
        }
        const code = 'LOGIN_' + Math.floor(100000 + Math.random() * 900000);
        const link = 'https://t.me/' + cfg.botName + '?start=' + code;
        // API сервера: локально это server/server.js (порт 3001), на проде — Vercel-функция
        const apiBase = (location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
            ? 'http://localhost:3001'
            : '';
        // Сразу перекидываем в бота — от пользователя нужен только клик по Start
        window.open(link, '_blank', 'noopener');
        box.innerHTML =
            '<p class="social-auth__note">' +
            'Открыт <b>@' + cfg.botName + '</b> — нажмите в нём <b>Start</b>.<br>' +
            'Возвращаться на сайт не нужно: вход выполнится сам.<br>' +
            '<span class="social-auth__wait">⏳ Ожидание подтверждения…</span></p>';
        let tries = 0;
        const timer = setInterval(function() {
            tries++;
            const waitEl = box.querySelector('.social-auth__wait');
            if (tries > 60) {
                clearInterval(timer);
                if (waitEl) waitEl.textContent = '⏱ Время вышло. Нажмите кнопку «Telegram» ещё раз.';
                return;
            }
            fetch(apiBase + '/api/tg-check?code=' + code + '&t=' + Date.now())
                .then(function(r) { return r.json(); })
                .then(function(d) {
                    if (d && d.success && d.profile) {
                        clearInterval(timer);
                        if (waitEl) waitEl.textContent = '✅ Вход подтверждён!';
                        socialLogin('telegram', d.profile);
                    }
                })
                .catch(function() { /* сервер ещё не доступен — пробуем дальше */ });
        }, 2000);
    }

    // --- Google (OAuth 2.0 popup: сразу открывает окно выбора аккаунта) ---
    function initGoogleButton(modal, box) {
        const cfg = SOCIAL_CONFIG.google;
        if (!cfg.enabled) { box.innerHTML = '<p class="social-auth__note">Вход через Google отключён (js/script.js).</p>'; return; }
        if (!cfg.clientId) {
            box.innerHTML = '<p class="social-auth__note">Google не настроен.<br>Создайте OAuth-клиент в Google Cloud Console и впишите <b>clientId</b> в <b>js/social-config.js</b>.</p>';
            return;
        }
        if (location.protocol === 'file:') {
            box.innerHTML = '<p class="social-auth__note">⚠️ <b>Google-вход недоступен, когда сайт открыт как файл</b> (file://).<br>Google требует https-адрес или localhost.<br>Откройте сайт на <b>http://localhost:3001</b> (сервер Nexora уже запущен) — там вход через Google заработает.</p>';
            return;
        }
        // Сразу открываем всплывающее окно Google с выбором аккаунта.
        openGooglePicker(box);
    }

    // Открывает popup Google «Выберите аккаунт» (prompt=select_account).
    // Вызывается из доверенного клика, поэтому всплывающее окно не блокируется.
    function openGooglePicker(box) {
        function doOpen() {
            try {
                const client = google.accounts.oauth2.initTokenClient({
                    client_id: SOCIAL_CONFIG.google.clientId,
                    scope: 'openid email profile',
                    prompt: 'select_account',
                    callback: function(resp) {
                        if (!resp || resp.error) {
                            alert('Вход через Google не выполнен: ' + ((resp && (resp.error_description || resp.error)) || 'окно закрыто'));
                            return;
                        }
                        // По access-токену получаем профиль (sub, name, email, picture).
                        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { 'Authorization': 'Bearer ' + resp.access_token }
                        })
                        .then(function(r) { return r.json(); })
                        .then(function(p) {
                            socialLogin('google', {
                                id: String(p.sub),
                                name: p.name || '',
                                email: p.email || '',
                                avatar: p.picture || null
                            });
                        })
                        .catch(function() { alert('Не удалось получить данные профиля Google.'); });
                    }
                });
                client.requestAccessToken();
            } catch (e) {
                alert('Google Sign-In не инициализировался. Проверьте clientId и домен в Google Cloud Console.');
            }
        }
        if (window.google && window.google.accounts && window.google.accounts.oauth2) { doOpen(); return; }
        // SDK ещё не догрузился — подгружаем и пробуем снова.
        box.innerHTML = '<p class="social-auth__note">Загружаем Google…<br>Нажмите ещё раз через секунду.</p>';
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = function() { box.innerHTML = ''; doOpen(); };
        s.onerror = function() { box.innerHTML = '<p class="social-auth__note">Не удалось загрузить Google Sign-In. Проверьте соединение.</p>'; };
        document.head.appendChild(s);
    }

    // Кнопки «Telegram / Google» в модалках входа и регистрации
    document.querySelectorAll('.social-auth [data-social]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const modal = btn.closest('.modal');
            const box = modal ? modal.querySelector('.social-auth__box') : null;
            const provider = btn.dataset.social;
            if (!box) return;
            if (provider === 'telegram') startTgCodeLogin(box);
            else if (provider === 'google') initGoogleButton(modal, box);
        });
    });

    // Logout from dropdown
    btnLogout.addEventListener('click', () => {
        isLoggedIn = false;
        currentUser = null;
        localStorage.removeItem('nexora_current_user');
        profileDropdown.classList.remove('open');
        updateAuthUI();
    });

    // ===========================================
    // 6a. FORGOT PASSWORD (email reset)
    // ===========================================
    let resetState = null;
    let resetOverlay = null;
    let resetFormEl = null;

    function getResetRequests() {
        try { return JSON.parse(localStorage.getItem('nexora_reset_requests')) || []; } catch { return []; }
    }
    function saveResetRequests(list) {
        localStorage.setItem('nexora_reset_requests', JSON.stringify(list));
    }
    // Убираем старые/чужие запросы для этого email, оставляем остальные с живым сроком
    function cleanupResetRequests(email) {
        const now = Date.now();
        return getResetRequests().filter(r => (r.email !== email) && (!r.expiresAt || r.expiresAt > now));
    }

    function buildResetModal() {
        resetOverlay = document.createElement('div');
        resetOverlay.id = 'nexora-reset-overlay';
        resetOverlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.74);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:20px';
        resetOverlay.innerHTML = `
            <div style="background:var(--surface,#181818);border:1px solid var(--border,#2a2a2a);border-radius:16px;width:100%;max-width:420px;padding:26px;position:relative;box-shadow:0 24px 60px rgba(0,0,0,.5)">
                <button type="button" id="nexora-reset-close" aria-label="Закрыть" style="position:absolute;top:14px;right:14px;background:none;border:none;color:var(--text-muted,#888);font-size:18px;cursor:pointer;line-height:1">&#10005;</button>
                <div style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;margin-bottom:16px">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent,#FFFFFF)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <h3 style="margin:0 0 4px;font-size:18px;font-weight:700;color:var(--text,#fff)">Сброс пароля</h3>
                <form id="nexora-reset-form" style="margin-top:14px"></form>
            </div>`;
        resetOverlay.addEventListener('click', e => {
            if (e.target === resetOverlay) closeResetModal();
        });
        resetOverlay.querySelector('#nexora-reset-close').addEventListener('click', closeResetModal);
        resetFormEl = resetOverlay.querySelector('#nexora-reset-form');
        resetFormEl.addEventListener('submit', onResetSubmit);
    }

    function openResetModal() {
        if (!resetOverlay) buildResetModal();
        resetState = { step: 1, email: '' };
        renderResetForm(step1Html());
        if (!document.body.contains(resetOverlay)) document.body.appendChild(resetOverlay);
        resetOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        setTimeout(() => resetFormEl.querySelector('#nexora-reset-email')?.focus(), 100);
    }

    function closeResetModal() {
        if (!resetOverlay) return;
        resetOverlay.style.display = 'none';
        if (resetOverlay.parentNode) resetOverlay.parentNode.removeChild(resetOverlay);
        document.body.style.overflow = '';
        resetState = null;
    }

    function renderResetForm(html) {
        const err = resetFormEl.querySelector('.form-error');
        if (err) err.remove();
        resetFormEl.innerHTML = html;
        const done = resetFormEl.querySelector('#nexora-reset-done');
        if (done) done.addEventListener('click', closeResetModal);
        const resend = resetFormEl.querySelector('#nexora-reset-resend');
        if (resend) resend.addEventListener('click', resendResetCode);
    }

    function showResetError(msg) {
        const err = resetFormEl.querySelector('.form-error');
        if (err) err.remove();
        const el = document.createElement('p');
        el.className = 'form-error';
        el.style.cssText = 'color:var(--accent,#FFFFFF);font-size:12px;margin-bottom:12px;font-weight:500';
        el.textContent = '⤫ ' + msg;
        resetFormEl.querySelector('[type="submit"]').before(el);
    }

    function showResetInfo(msg) {
        const err = resetFormEl.querySelector('.form-error');
        if (err) err.remove();
        const el = document.createElement('p');
        el.className = 'form-error';
        el.style.cssText = 'color:#22C55E;font-size:12px;margin-bottom:12px;font-weight:500';
        el.textContent = '✓ ' + msg;
        resetFormEl.querySelector('[type="submit"]').before(el);
    }

    function step1Html() {
        return `
            <p style="font-size:13px;color:var(--text-secondary,#a0a0a0);margin:0 0 16px">Укажите email, привязанный к аккаунту. Мы отправим код для смены пароля.</p>
            <div class="form-group" style="margin-bottom:14px">
                <label class="form-label" style="font-size:12px;color:var(--text-muted,#888);margin-bottom:6px;display:block">Email</label>
                <input type="email" class="form-input" id="nexora-reset-email" placeholder="name@domain.com" value="${esc(resetState.email || '')}" style="width:100%;background:var(--bg,#0a0a0a);border:1px solid var(--border,#2a2a2a);border-radius:8px;padding:11px 14px;color:var(--text,#fff);font-size:14px;outline:none">
            </div>
            <button type="submit" class="btn btn--primary" style="width:100%;padding:12px;border:none;border-radius:8px;background:var(--accent,#FFFFFF);color:#0A0B0E;font-size:14px;font-weight:600;cursor:pointer">Отправить код</button>
            <p style="font-size:11px;color:var(--text-muted,#666);margin:12px 0 0;text-align:center">Код придёт на почту и действует 10 минут</p>`;
    }

    function step2Html(devCode) {
        return `
            <p style="font-size:13px;color:var(--text-secondary,#a0a0a0);margin:0 0 16px">Код отправлен на ${esc(resetState.email)}. Введите его и задайте новый пароль.</p>
            ${devCode ? '<div style="background:rgba(245,158,11,.1);border:1px dashed rgba(245,158,11,.4);border-radius:8px;padding:10px 14px;margin:0 0 14px"><div style="font-size:11px;color:#f59e0b;margin-bottom:4px;font-weight:600">⚠️ Письмо не отправлено (SMTP не настроен). Ваш код:</div><div style="font-size:24px;font-weight:700;letter-spacing:6px;color:#f59e0b;font-family:var(--font-mono)">' + esc(devCode) + '</div></div>' : ''}
            <div class="form-group" style="margin-bottom:14px">
                <label class="form-label" style="font-size:12px;color:var(--text-muted,#888);margin-bottom:6px;display:block">Код из письма</label>
                <input type="text" class="form-input" id="nexora-reset-code" placeholder="000000" maxlength="6" style="width:100%;text-align:center;font-size:20px;font-weight:700;letter-spacing:4px;font-family:var(--font-mono);background:var(--bg,#0a0a0a);border:1px solid var(--border,#2a2a2a);border-radius:8px;padding:11px 14px;color:var(--text,#fff);outline:none">
            </div>
            <div class="form-group" style="margin-bottom:14px">
                <label class="form-label" style="font-size:12px;color:var(--text-muted,#888);margin-bottom:6px;display:block">Новый пароль</label>
                <input type="password" class="form-input" id="nexora-reset-pass" placeholder="Минимум 4 символа" style="width:100%;background:var(--bg,#0a0a0a);border:1px solid var(--border,#2a2a2a);border-radius:8px;padding:11px 14px;color:var(--text,#fff);font-size:14px;outline:none">
            </div>
            <div class="form-group" style="margin-bottom:14px">
                <label class="form-label" style="font-size:12px;color:var(--text-muted,#888);margin-bottom:6px;display:block">Повторите пароль</label>
                <input type="password" class="form-input" id="nexora-reset-pass2" placeholder="Повторите новый пароль" style="width:100%;background:var(--bg,#0a0a0a);border:1px solid var(--border,#2a2a2a);border-radius:8px;padding:11px 14px;color:var(--text,#fff);font-size:14px;outline:none">
            </div>
            <button type="submit" class="btn btn--primary" style="width:100%;padding:12px;border:none;border-radius:8px;background:var(--accent,#FFFFFF);color:#0A0B0E;font-size:14px;font-weight:600;cursor:pointer">Изменить пароль</button>
            <button type="button" id="nexora-reset-resend" class="btn btn--ghost" style="width:100%;margin-top:8px;padding:11px;border:1px solid var(--border,#2a2a2a);border-radius:8px;background:none;color:var(--text-secondary,#a0a0a0);font-size:13px;cursor:pointer">Отправить код ещё раз</button>`;
    }

    function successHtml(title, sub) {
        return `
            <div style="text-align:center;padding:8px 0">
                <div style="width:48px;height:48px;border-radius:50%;background:rgba(34,197,94,.14);display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p style="font-size:15px;font-weight:600;margin:0 0 6px;color:var(--text,#fff)">${esc(title)}</p>
                <p style="font-size:12px;color:var(--text-muted,#888);margin:0 0 18px">${esc(sub)}</p>
                <button type="button" id="nexora-reset-done" class="btn btn--primary" style="padding:11px 24px;border:none;border-radius:8px;background:var(--accent,#FFFFFF);color:#0A0B0E;font-size:14px;font-weight:600;cursor:pointer">Понятно</button>
            </div>`;
    }

    async function onResetSubmit(e) {
        e.preventDefault();
        const btn = resetFormEl.querySelector('[type="submit"]');
        if (!btn || btn.disabled) return;

        if (resetState.step === 1) {
            const email = resetFormEl.querySelector('#nexora-reset-email').value.trim().toLowerCase();
            if (!email || !validateEmail(email)) { showResetError('Введите корректный email'); return; }

            const cleaned = cleanupResetRequests(email);
            const code = generateCode();
            const user = getUsers().find(u => u.email && u.email.toLowerCase() === email);
            cleaned.push({ email, code, expiresAt: Date.now() + 10 * 60 * 1000, createdAt: new Date().toISOString() });
            saveResetRequests(cleaned);
            resetState = { step: 1, email, code };

            const orig = btn.textContent;
            btn.textContent = '⏳ Отправка...';
            btn.disabled = true;
            try {
                const res = await fetch(MAIL_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to_email: email, to_name: user ? user.nickname : 'геймер', code })
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Mail error');
                resetState.step = 2;
                renderResetForm(step2Html());
                setTimeout(() => resetFormEl.querySelector('#nexora-reset-code')?.focus(), 100);
            } catch (err) {
                console.error('Reset mail error:', err);
                // Письмо не ушло (SMTP не настроен) — показываем код прямо в форме
                resetState.step = 2;
                renderResetForm(step2Html(resetState.code));
            } finally {
                btn.textContent = orig;
                btn.disabled = false;
            }
            return;
        }

        if (resetState.step === 2) {
            const codeInput = resetFormEl.querySelector('#nexora-reset-code');
            const passInput = resetFormEl.querySelector('#nexora-reset-pass');
            const pass2Input = resetFormEl.querySelector('#nexora-reset-pass2');
            if (!codeInput.value.trim()) { showResetError('Введите код из письма'); return; }
            if (!passInput.value) { showResetError('Введите новый пароль'); return; }
            if (passInput.value !== pass2Input.value) { showResetError('Пароли не совпадают'); return; }
            if (passInput.value.length < 4) { showResetError('Пароль должен быть минимум 4 символа'); return; }

            const requests = getResetRequests();
            const valid = requests.find(r => r.email === resetState.email && r.code === codeInput.value.trim() && r.expiresAt && r.expiresAt > Date.now());
            if (!valid) {
                showResetError('Неверный или устаревший код. Запросите новый');
                return;
            }
            saveResetRequests(requests.filter(r => r.email !== resetState.email));

            const users = getUsers();
            const user = users.find(u => u.email && u.email.toLowerCase() === resetState.email);
            if (!user) {
                renderResetForm(successHtml('Аккаунт с таким email не найден', 'Проверьте email или зарегистрируйтесь'));
                return;
            }

            user.password = await hashPassword(passInput.value);
            saveUsers(users);
            if (currentUser && (currentUser.email || '').toLowerCase() === resetState.email) {
                currentUser.password = user.password;
                localStorage.setItem('nexora_current_user', JSON.stringify(currentUser));
            }
            renderResetForm(successHtml('Пароль успешно изменён', 'Теперь можно войти с новым паролем'));
        }
    }

    async function resendResetCode() {
        const btn = resetFormEl.querySelector('#nexora-reset-resend');
        const code = generateCode();
        const cleaned = cleanupResetRequests(resetState.email);
        const user = getUsers().find(u => u.email && u.email.toLowerCase() === resetState.email);
        cleaned.push({ email: resetState.email, code, expiresAt: Date.now() + 10 * 60 * 1000, createdAt: new Date().toISOString() });
        saveResetRequests(cleaned);
        resetState.code = code;
        if (btn) { btn.textContent = '⏳ Отправка...'; btn.disabled = true; }
        try {
            const res = await fetch(MAIL_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to_email: resetState.email, to_name: user ? user.nickname : 'геймер', code })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Mail error');
            showResetInfo('Код отправлен повторно');
        } catch (err) {
            console.error('Reset resend error:', err);
            // Письмо не ушло — показываем код прямо в форме
            resetState.step = 2;
            renderResetForm(step2Html(resetState.code));
        } finally {
            if (btn) { btn.textContent = 'Отправить код ещё раз'; btn.disabled = false; }
        }
    }

    // Открытие по ссылкам «Забыли пароль?» на всех страницах
    document.addEventListener('click', e => {
        const link = e.target.closest('[data-reset-password]');
        if (link) {
            e.preventDefault();
            closeModal();
            openResetModal();
        }
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && resetState) closeResetModal();
    });

    // ===========================================
    // 6b. Profile modal
    // ===========================================
    const btnProfileLink = document.getElementById('btn-profile-link');
    if (btnProfileLink) {
        btnProfileLink.addEventListener('click', e => {
            e.preventDefault();
            profileDropdown.classList.remove('open');
            openModal('profile');
            renderProfile();
            renderSettings();
        });
    }

    function getResults() {
        try { return JSON.parse(localStorage.getItem('nexora_results')) || []; } catch { return []; }
    }

    function getRegistrations() {
        try { return JSON.parse(localStorage.getItem('nexora_registrations')) || []; } catch { return []; }
    }

    function getTournaments() {
        try { return JSON.parse(localStorage.getItem('nexora_tournaments')) || []; } catch { return []; }
    }

    function renderProfile() {
        if (!currentUser) return;
        const nickname = currentUser.nickname || '—';
        const email = currentUser.email || '—';

        document.getElementById('profile-modal-nick').textContent = nickname;
        document.getElementById('profile-modal-email').textContent = email;
        // Initial letter
        const initialEl = document.getElementById('profile-modal-initial');
        if (initialEl) initialEl.textContent = nickname.length > 1 ? nickname[0].toUpperCase() : '—';
        // Registered date
        const sinceEl = document.getElementById('profile-modal-since');
        if (sinceEl) {
            sinceEl.textContent = currentUser.registeredAt
                ? new Date(currentUser.registeredAt).toLocaleDateString('ru-RU', { month: 'long', day: 'numeric' })
                : '—';
        }

        const regs = getRegistrations();
        const results = getResults();
        const tournaments = getTournaments();

        // My registrations
        const myRegs = regs.filter(r => r.userId === nickname || r.userId === currentUser.email);
        // My results
        const myResults = results.filter(r => r.userId === nickname || r.userId === currentUser.email);

        // Stats
        const total = myRegs.length;
        document.getElementById('profile-stat-tournaments').textContent = total;

        const places = myResults.filter(r => r.place).map(r => r.place);
        const best = places.length ? Math.min(...places) : null;
        document.getElementById('profile-stat-best').textContent = best ? best + ' место' : '—';

        // Count prize tours (top-3)
        const prizeCount = places.filter(p => p <= 3).length;
        document.getElementById('profile-stat-prize').textContent = prizeCount;

        // History
        const historyEl = document.getElementById('profile-history');
        if (!myRegs.length) {
            historyEl.innerHTML = '<div class="profile-history-empty">Вы ещё не участвовали в турнирах</div>';
            return;
        }

        // Sort by most recent
        myRegs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        historyEl.innerHTML = myRegs.slice(0, 20).map(r => {
            const t = tournaments.find(t => t.id === r.tournamentId);
            const tName = t ? t.name : 'Турнир #' + r.tournamentId;
            const tStatus = t ? t.status : 'unknown';
            const res = myResults.find(res => res.tournamentId === r.tournamentId);
            const placeNum = res && res.place ? res.place : null;
            const placeStr = placeNum ? placeNum + ' место' : (tStatus === 'completed' ? '—' : 'Идёт');
            const placeClass = placeNum === 1 ? 'gold' : (placeNum === 2 ? 'silver' : (placeNum === 3 ? 'bronze' : 'default'));
            const dateStr = r.date ? new Date(r.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—';
            return `
                <div class="profile-history-item">
                    <div class="profile-history-item__info">
                        <div class="profile-history-item__name">${esc(tName)}</div>
                        <div class="profile-history-item__meta">${esc(dateStr)} · ID: ${esc(r.playerId || '—')}</div>
                    </div>
                    <span class="profile-history-item__place profile-history-item__place--${placeClass}">${esc(placeStr)}</span>
                </div>
            `;
        }).join('');
    }

    // Register profile-modal in the modal system
    const profileModal = document.getElementById('profile-modal');
    if (profileModal) {
        modals.profile = profileModal;
    }

    // Profile tab switching
    document.addEventListener('click', e => {
        const tab = e.target.closest('[data-profile-tab]');
        if (!tab) return;
        const modal = tab.closest('.modal');
        if (!modal) return;
        // Toggle tabs
        modal.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // Toggle content
        const target = tab.dataset.profileTab; // 'stats' or 'settings'
        modal.querySelectorAll('.profile-content').forEach(c => c.classList.remove('active'));
        const content = modal.querySelector('#profile-content-' + target);
        if (content) content.classList.add('active');
        // Render settings when tab is clicked
        if (target === 'settings') renderSettings();
    });

    // ===========================================
    // 6d. Profile settings
    // ===========================================
    const SETTINGS_KEY = 'nexora_user_settings';

    function getSettings() {
        try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
    }
    function saveSettings(all) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
    }
    function getUserSettings(email) {
        const all = getSettings();
        return all[email] || { notifications: { 'new-tournament': true, 'results': true, 'start': true, 'news': false } };
    }
    function saveUserSettings(email, data) {
        const all = getSettings();
        all[email] = data;
        saveSettings(all);
    }

    function renderSettings() {
        if (!currentUser) return;
        const email = currentUser.email || '';

        // Account info
        const emailEl = document.getElementById('settings-email');
        if (emailEl) emailEl.textContent = email;
        const regdateEl = document.getElementById('settings-regdate');
        if (regdateEl) {
            regdateEl.textContent = currentUser.registeredAt
                ? new Date(currentUser.registeredAt).toLocaleDateString('ru-RU', { month: 'long', day: 'numeric', year: 'numeric' })
                : '—';
        }

        // Hide previous messages
        const successEl = document.getElementById('settings-pass-success');
        const errorEl = document.getElementById('settings-pass-error');
        if (successEl) successEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
        // Clear password fields
        ['settings-old-pass', 'settings-new-pass', 'settings-confirm-pass'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        // Load notification toggles
        const settings = getUserSettings(email);
        const notifs = settings.notifications || {};
        document.querySelectorAll('[data-setting]').forEach(cb => {
            const key = cb.dataset.setting.replace('notif-', '');
            cb.checked = notifs[key] !== false; // default true
        });
    }

    // Save notification toggle on change
    document.addEventListener('change', e => {
        const cb = e.target.closest('[data-setting]');
        if (!cb || !currentUser) return;
        const settings = getUserSettings(currentUser.email);
        if (!settings.notifications) settings.notifications = {};
        const key = cb.dataset.setting.replace('notif-', '');
        settings.notifications[key] = cb.checked;
        saveUserSettings(currentUser.email, settings);
    });

    // Password change
    document.getElementById('btn-save-password')?.addEventListener('click', async () => {
        const successEl = document.getElementById('settings-pass-success');
        const errorEl = document.getElementById('settings-pass-error');
        if (!successEl || !errorEl) return;
        successEl.style.display = 'none';
        errorEl.style.display = 'none';

        const oldPass = document.getElementById('settings-old-pass')?.value || '';
        const newPass = document.getElementById('settings-new-pass')?.value || '';
        const confirmPass = document.getElementById('settings-confirm-pass')?.value || '';

        if (!oldPass || !newPass || !confirmPass) {
            errorEl.textContent = '⤫ Заполните все поля';
            errorEl.style.display = 'block';
            return;
        }
        if (newPass.length < 4) {
            errorEl.textContent = '⤫ Новый пароль должен быть минимум 4 символа';
            errorEl.style.display = 'block';
            return;
        }
        if (newPass !== confirmPass) {
            errorEl.textContent = '⤫ Новые пароли не совпадают';
            errorEl.style.display = 'block';
            return;
        }

        // Update password
        const users = getUsers();
        const idx = users.findIndex(u => u.email === currentUser.email);
        if (idx === -1) {
            errorEl.textContent = '⤫ Пользователь не найден';
            errorEl.style.display = 'block';
            return;
        }
        const stored = users[idx].password;
        if (!await passwordMatches(oldPass, stored)) {
            errorEl.textContent = '⤫ Неверный текущий пароль';
            errorEl.style.display = 'block';
            return;
        }
        users[idx].password = await hashPassword(newPass);
        saveUsers(users);
        currentUser.password = users[idx].password;
        localStorage.setItem('nexora_current_user', JSON.stringify(currentUser));

        successEl.style.display = 'block';
        document.getElementById('settings-old-pass').value = '';
        document.getElementById('settings-new-pass').value = '';
        document.getElementById('settings-confirm-pass').value = '';
        setTimeout(() => { successEl.style.display = 'none'; }, 3000);
    });

    // Settings logout
    document.getElementById('btn-settings-logout')?.addEventListener('click', () => {
        isLoggedIn = false;
        currentUser = null;
        localStorage.removeItem('nexora_current_user');
        profileDropdown?.classList.remove('open');
        closeModal();
        updateAuthUI();
    });

    // ===========================================
    // 6c. Restore session across pages
    // ===========================================
    const savedUser = (() => { try { return JSON.parse(localStorage.getItem('nexora_current_user')); } catch { return null; } })();
    if (savedUser) {
        currentUser = savedUser;
        isLoggedIn = true;
    }
    // Автоисправление ника соцпользователя (например, после смены @ник в Telegram)
    if (currentUser && currentUser.social && currentUser.social.username &&
        currentUser.nickname && currentUser.nickname !== currentUser.social.username) {
        try {
            const want = currentUser.social.username;
            const allUsers = JSON.parse(localStorage.getItem('nexora_users') || '[]');
            const regsM = JSON.parse(localStorage.getItem('nexora_registrations') || '[]');
            const hasRegsM = regsM.some(r => r.userId === currentUser.nickname || r.userId === currentUser.email);
            const free = allUsers.every(u => u.nickname !== want || u.email === currentUser.email);
            if (!hasRegsM && free) {
                const idx = allUsers.findIndex(u => u.nickname === currentUser.nickname && u.email === currentUser.email);
                if (idx !== -1) { allUsers[idx].nickname = want; localStorage.setItem('nexora_users', JSON.stringify(allUsers)); }
                currentUser.nickname = want;
                localStorage.setItem('nexora_current_user', JSON.stringify(currentUser));
            }
        } catch (e) {}
    }
    updateAuthUI();

    // ===========================================
    // 6d. Автооткрытие модалки по ?auth=login|register|profile
    // (переход со статических страниц через js/auth-ui.js)
    // ===========================================
    try {
        var authParam = new URLSearchParams(location.search).get('auth');
        if (authParam === 'login' || authParam === 'register') {
            openModal(authParam);
        } else if (authParam === 'profile') {
            openModal('profile');
            renderProfile();
            renderSettings();
        }
        if (authParam) {
            // Убираем ?auth из адресной строки, чтобы F5 не открывал модалку снова
            var cleanUrl = new URL(location.href);
            cleanUrl.searchParams.delete('auth');
            history.replaceState(null, '', cleanUrl.toString());
        }
    } catch (e) {}

    // ===========================================
    // 7. PASSWORD TOGGLE (event delegation)
    // ===========================================
    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-toggle-pass]');
        if (!btn) return;
        e.preventDefault();
        const input = document.getElementById(btn.dataset.togglePass);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.setAttribute('aria-label', isPassword ? 'Скрыть пароль' : 'Показать пароль');
        const eyeSvg = btn.querySelector('.pw-eye');
        const eyeOffSvg = btn.querySelector('.pw-eye-off');
        if (eyeSvg) eyeSvg.style.display = isPassword ? 'none' : '';
        if (eyeOffSvg) eyeOffSvg.style.display = isPassword ? '' : 'none';
    });

    // ===========================================
    // 8. ГЛОБАЛЬНАЯ СИСТЕМА ПРОФИЛЕЙ (аватарки)
    // ===========================================
    const PROFILE_COLORS = ['#6366F1','#14B8A6','#EC4899','#0EA5E9','#EF4444','#8B5CF6','#10B981','#F97316','#84CC16','#64748B'];

    window.nexoraGetProfile = function(nickname) {
        if (!nickname) return null;
        try {
            var all = JSON.parse(localStorage.getItem('nexora_profiles'));
            if (all && all[nickname]) return all[nickname];
        } catch(e) {}
        return null;
    };

    window.nexoraSaveProfile = function(nickname, data) {
        if (!nickname) return;
        try {
            var all = JSON.parse(localStorage.getItem('nexora_profiles')) || {};
            all[nickname] = data;
            localStorage.setItem('nexora_profiles', JSON.stringify(all));
        } catch(e) {}
    };

    // Хелпер — avatarUrl: возвращает src для img или null
    window.nexoraAvatarUrl = function(nickname) {
        var p = window.nexoraGetProfile(nickname);
        if (p && p.avatarImage) return p.avatarImage;
        return null;
    };

    // Хелпер — avatarBg: цвет фона под аватар
    window.nexoraAvatarBg = function(nickname) {
        var p = window.nexoraGetProfile(nickname);
        if (p && p.bgColor) return p.bgColor;
        if (!nickname) return '#3A3F4B';
        var hash = 0;
        for (var i = 0; i < nickname.length; i++) hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
        return PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length];
    };

});


// ===========================================
// 9. CHAT — one system for all pages
// ===========================================
(function() {
    // create overlay if needed
    if (!document.getElementById('modal-overlay')) {
        var ov = document.createElement('div'); ov.id = 'modal-overlay'; ov.className = 'modal-overlay';
        document.body.appendChild(ov);
    }
    // create chat modal if needed
    if (!document.getElementById('chat-modal')) {
        var m = document.createElement('div'); m.id = 'chat-modal'; m.className = 'modal modal--wide';
        m.innerHTML = [
            '<div class="modal__header">',
                '<h3 class="modal__title" id="chat-modal-title">Чат</h3>',
                '<button class="modal__close" id="chat-close">&times;</button>',
            '</div>',
            '<div class="chat-content" style="display:flex;flex-direction:column;height:65vh;min-height:400px;max-height:700px">',
                '<div style="display:flex;position:relative;border-bottom:1px solid var(--border);padding:0 16px;flex-shrink:0">',
                    '<button class="chat-tab active" data-chat-tab="general" style="flex:1;padding:10px;background:none;border:none;cursor:pointer;font-size:12px;font-weight:600;color:var(--accent)">Общий чат</button>',
                    '<button class="chat-tab" data-chat-tab="organizer" style="flex:1;padding:10px;background:none;border:none;cursor:pointer;font-size:12px;font-weight:600;position:relative;color:var(--text-muted)">',
                        'Организатор',
                        '<span id="organizer-unread-badge" style="display:none;position:absolute;top:4px;right:4px;min-width:16px;height:16px;background:#EF4444;color:#fff;font-size:9px;font-weight:700;border-radius:50px;align-items:center;justify-content:center;padding:0 4px"></span>',
                    '</button>',
                    '<div id="chat-tab-indicator" style="position:absolute;bottom:0;height:2px;background:var(--accent);transition:transform .3s,width .3s;border-radius:2px 2px 0 0;pointer-events:none"></div>',
                '</div>',
                '<div style="display:flex;flex:1;min-height:0">',
                    '<div style="flex:1;display:flex;flex-direction:column;background:var(--bg-chat,rgba(0,0,0,.15))">',
                        '<div id="chat-messages" style="flex:1;overflow-y:auto;padding:8px 12px;display:flex;flex-direction:column">',
                            '<div id="chat-empty" style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px">Нет сообщений. Напишите первым!</div>',
                        '</div>',
                        '<div id="chat-reply-indicator" style="display:none;align-items:flex-start;gap:8px;padding:8px 12px 0;background:var(--bg-alt);flex-direction:column">',
                            '<div style="display:flex;align-items:center;gap:8px;width:100%">',
                                '<span style="font-size:11px;color:#f59e0b;white-space:nowrap">Ответ <strong id="chat-reply-name"></strong></span>',
                                '<button id="chat-reply-cancel" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:11px;padding:2px 8px;border-radius:4px">Отмена</button>',
                            '</div>',
                            '<div id="chat-reply-quote" style="padding:6px 10px;background:rgba(0,0,0,.12);border-radius:6px;color:var(--text-secondary);font-size:12px;line-height:1.3;max-width:100%;word-break:break-word;width:100%"></div>',
                        '</div>',
                        '<div style="display:flex;gap:6px;padding:8px 12px;border-top:1px solid var(--border);background:var(--bg-alt)">',
                            '<input type="text" id="chat-input" placeholder="Написать сообщение..." style="flex:1;padding:9px 14px;border-radius:20px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;outline:none">',
                            '<button id="chat-send" style="width:38px;height:38px;padding:0;background:var(--accent);color:#0A0B0E;border:none;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0">&#10148;</button>',
                        '</div>',
                    '</div>',
                    '<div style="width:240px;border-left:1px solid var(--border);padding:14px;display:flex;flex-direction:column;gap:10px">',
                        '<p style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Участники</p>',
                        '<div id="chat-users" style="display:flex;flex-direction:column;gap:4px;flex:1;overflow-y:auto"></div>',
                    '</div>',
                '</div>',
            '</div>',
        ].join('');
        document.body.appendChild(m);
    }

    // --- state ---
    var activeTournamentId = null, activeTab = 'general', refreshInterval = null;
    var chatReplyToUser = null, chatReplyToText = null;

    // --- helpers ---
    function $id(i) { return document.getElementById(i); }
    function getUser() { try { return JSON.parse(localStorage.getItem('nexora_current_user')); } catch { return null; } }
    function getRegs() { try { return JSON.parse(localStorage.getItem('nexora_registrations')) || []; } catch { return []; } }
    function getTours() { try { return JSON.parse(localStorage.getItem('nexora_tournaments')) || []; } catch { return []; } }
    function getMsgs() { try { return JSON.parse(localStorage.getItem('nexora_chat_messages')) || []; } catch { return []; } }
    function saveMsgs(v) { localStorage.setItem('nexora_chat_messages', JSON.stringify(v)); }
    function getProfiles() { try { return JSON.parse(localStorage.getItem('nexora_profiles')) || {}; } catch { return {}; } }
    function getProf(u) { var p = getProfiles()[u]; return p || {}; }
    // Локальный список покинутых турниров: после выхода чат закрыт,
    // даже если регистрация вернулась с сервера при синхронизации
    function getLeftList() { try { return JSON.parse(localStorage.getItem('nexora_left_tournaments')) || []; } catch(e) { return []; } }
    function isInLeftList(u, tid) {
        var regs = getRegs(); tid = Number(tid);
        for (var i = 0; i < regs.length; i++) {
            if (regs[i].userId === u.nickname && Number(regs[i].tournamentId) === tid) return false;
        }
        var list = getLeftList();
        for (var i = 0; i < list.length; i++) { if (list[i].userId === u.nickname && Number(list[i].tournamentId) === tid) return true; }
        return false;
    }
    // Статус доступа к чату: 'ok' — можно, 'left' — вышел из турнира,
    // 'no-reg' — нет заявки, 'not-paid' — заявка есть, но оплата не выполнена.
    // Чат открыт только участникам, оплатившим участие в платном турнире
    // (в бесплатном турнире оплата не требуется).
    function chatAccess(u, tid) {
        if (!u) return 'no-reg';
        if (isInLeftList(u, tid)) return 'left';
        var regs = getRegs(); tid = Number(tid);
        for (var i = 0; i < regs.length; i++) {
            if (regs[i].userId === u.nickname && Number(regs[i].tournamentId) === tid) {
                var fee = 0;
                var tours = getTours();
                for (var j = 0; j < tours.length; j++) { if (tours[j].id === tid) { fee = Number(tours[j].fee) || 0; break; } }
                if (fee <= 0) return 'ok'; // бесплатный турнир
                if (regs[i].paid === true) return 'ok';
                return 'not-paid'; // зарегистрирован, но не оплатил
            }
        }
        return 'no-reg';
    }
    // Резолв идентификатора в ник: если userId — email, ищем никнейм по пользователям
    function resolveNick(u) {
        if (!u) return '—';
        if (String(u).indexOf('@') === -1) return u;
        try {
            var users = JSON.parse(localStorage.getItem('nexora_users')) || [];
            var found = users.find(function(x) { return x.email === u; });
            if (found && found.nickname) return found.nickname;
        } catch(e) {}
        return String(u).split('@')[0] || u;
    }
    function dispName(u) { var p = getProf(u); return p.nickname || resolveNick(u); }
    function avBg(u) { var p = getProf(u); return p.bgColor || '#3A3F4B'; }
    function avImg(u) { var p = getProf(u); return p.avatarImage || null; }

    function moveChatInd(tab) {
        var ind = $id('chat-tab-indicator');
        if (ind && tab) { ind.style.width = tab.offsetWidth + 'px'; ind.style.transform = 'translateX(' + tab.offsetLeft + 'px)'; }
    }

    var tabs = document.querySelectorAll('.chat-tab');
    tabs.forEach(function(t) {
        t.addEventListener('click', function() {
            tabs.forEach(function(x) { x.classList.remove('active'); x.style.color = 'var(--text-muted)'; });
            this.classList.add('active'); this.style.color = 'var(--accent)';
            activeTab = this.dataset.chatTab;
            var inp = $id('chat-input');
            if (inp) inp.placeholder = activeTab === 'organizer' ? 'Написать организатору...' : 'Написать сообщение...';
            if (activeTab === 'organizer' && activeTournamentId) {
                try { var rd = JSON.parse(localStorage.getItem('nexora_organizer_read')) || {}; rd[activeTournamentId] = new Date().toISOString(); localStorage.setItem('nexora_organizer_read', JSON.stringify(rd)); } catch(e) {}
                var badge = $id('organizer-unread-badge');
                if (badge) badge.style.display = 'none';
            }
            renderChat();
            var self = this;
            setTimeout(function() { moveChatInd(self); }, 20);
        });
    });

    function renderChat() {
        if (!activeTournamentId) return;
        var u = getUser();
        if (!u) return;
        // Доступ только для оплативших участников турнира — иначе чат закрывается
        if (chatAccess(u, activeTournamentId) !== 'ok') { window.closeChat(); return; }
        var all = getMsgs(), userTeamName = '';
        var regs = getRegs();
        var ur = null;
        for (var i = 0; i < regs.length; i++) { if (regs[i].userId === u.nickname && regs[i].tournamentId === activeTournamentId) { ur = regs[i]; break; } }
        if (ur && ur.teamName) userTeamName = ur.teamName;

        var msgs = all.filter(function(m) {
            if (m.tournamentId !== activeTournamentId) return false;
            var ct = m.chatType || 'general';
            if (ct !== activeTab) return false;
            if (activeTab === 'organizer') {
                return m.userId === u.nickname || m.targetUserId === u.nickname ||
                       (userTeamName && m.teamName === userTeamName && m.isAdmin && m.chatType === 'organizer');
            }
            return true;
        });

        var cont = $id('chat-messages'), empty = $id('chat-empty');
        if (!cont) return;
        cont.innerHTML = '';
        if (!msgs.length) {
            if (empty) { empty.style.display = 'block'; empty.textContent = activeTab === 'organizer' ? 'Нет сообщений с организатором' : 'Нет сообщений. Напишите первым!'; cont.appendChild(empty); }
        } else {
            if (empty) empty.style.display = 'none';
            var groups = [];
            msgs.forEach(function(m) { var g = groups[groups.length - 1]; if (g && g[0].userId === m.userId) g.push(m); else groups.push([m]); });
            groups.forEach(function(g) {
                var f = g[0];
                var myNick = u.nickname || resolveNick(u.email || '');
                var mine = resolveNick(f.userId) === myNick;
                var isAdmin = f.isAdmin || resolveNick(f.userId) === 'Taki';
                var li = g.length - 1;
                var dn = dispName(f.userId), bg = avBg(f.userId), avatar = avImg(f.userId);

                var isCaptain = regs.some(function(r) { return r.userId === f.userId && r.tournamentId === activeTournamentId && r.role === 'captain'; });
                var hdr = '';
                if (!mine) {
                    hdr = '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:3px;padding:0 4px">' +
                        '<span style="font-size:12px;font-weight:600;color:' + (isAdmin ? 'var(--accent)' : 'var(--text-muted)') + ';cursor:pointer" class="profile-link" data-user="' + esc(f.userId) + '">' + esc(dn) + '</span>';
                    if (isCaptain) hdr += '<span style="font-size:9px;color:#F59E0B;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.2);padding:1px 6px;border-radius:4px;font-weight:600;vertical-align:middle;margin-left:2px">Капитан</span>';
                    if (isAdmin) hdr += '<span style="font-size:10px;font-weight:600;color:var(--accent);background:rgba(255,255,255,.12);padding:1px 6px;border-radius:4px">' + (f.senderRole === 'organizer' ? 'Организатор' : 'Админ') + '</span>';
                    if (f.teamName) { hdr += '<span style="font-size:10px;color:var(--accent);font-weight:500;background:rgba(255,255,255,.08);padding:1px 6px;border-radius:4px;border:1px solid rgba(255,255,255,.15)">' + esc(f.teamName) + '</span>'; }
                    hdr += '</div>';
                }

                var bbls = '';
                g.forEach(function(m, i) {
                    var ts = new Date(m.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    var tail = i === li ? (mine ? 'border-bottom-right-radius:4px' : 'border-bottom-left-radius:4px') : '';
                    var bBg = mine ? 'var(--accent)' : 'var(--surface)';
                    var bCl = mine ? '#0A0B0E' : 'var(--text)';
                    var tCl = mine ? 'rgba(10,11,14,.5)' : 'var(--text-muted)';
                    var replyBlock = '';
                    if (m.replyToText) {
                        var replyName = dispName(m.targetUserId || '');
                        var rBg = mine ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.12)';
                        var rBorder = mine ? 'rgba(0,0,0,.35)' : 'var(--accent)';
                        var rNameCl = mine ? 'rgba(0,0,0,.65)' : 'rgba(255,255,255,.8)';
                        var rTextCl = mine ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.65)';
                        replyBlock = '<div style="padding:6px 10px;margin-bottom:6px;background:' + rBg + ';border-left:3px solid ' + rBorder + ';border-radius:6px;font-size:11px;line-height:1.3">' +
                            '<div style="font-weight:600;color:' + rNameCl + ';margin-bottom:2px">' + esc(replyName) + '</div>' +
                            '<div style="color:' + rTextCl + ';word-break:break-word">' + esc(m.replyToText) + '</div></div>';
                    }
                    var replyBtn = !mine ? '<button class="chat-reply-btn" data-user="' + esc(m.userId) + '" data-text="' + esc(m.text || '') + '" style="font-size:9px;color:var(--accent);background:none;border:1px solid rgba(255,255,255,.2);border-radius:4px;padding:1px 6px;cursor:pointer;white-space:nowrap;line-height:normal">Ответить</button>' : '';
                    bbls += '<div class="chat-bubble" style="padding:7px 12px;font-size:14px;line-height:1.4;word-break:break-word;background:' + bBg + ';color:' + bCl + ';border-radius:16px;' + tail + ';margin-bottom:2px;min-width:50px">' + replyBlock + '<div>' + esc(m.text) + '</div><div style="display:flex;align-items:center;justify-content:flex-end;gap:2px;margin-top:1px">' + replyBtn + '<span style="font-size:10px;color:' + tCl + ';white-space:nowrap">' + ts + '</span></div></div>';
                });

                var avHtml = '';
                if (!mine) {
                    avHtml = '<div style="flex-shrink:0;width:32px;height:32px;border-radius:50%;overflow:hidden;cursor:pointer;border:1.5px solid rgba(255,255,255,.06);align-self:flex-end;margin-bottom:2px" class="profile-link" data-user="' + esc(f.userId) + '" title="' + esc(dn) + '">';
                    if (avatar) avHtml += '<img src="' + esc(avatar) + '" style="width:32px;height:32px;object-fit:cover;display:block">';
                    else avHtml += '<div style="width:32px;height:32px;border-radius:50%;background:' + esc(bg) + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;line-height:1">' + esc(dn.charAt(0).toUpperCase()) + '</div>';
                    avHtml += '</div>';
                }

                var rowHtml = '<div style="display:flex;gap:6px;align-items:flex-end;margin-bottom:2px;' + (mine ? 'justify-content:flex-end' : '') + '">' +
                    (avHtml ? avHtml : '') +
                    '<div style="display:flex;flex-direction:column;max-width:78%;min-width:0;' + (mine ? 'align-items:flex-end' : 'align-items:flex-start') + '">';
                if (hdr) rowHtml += '<div style="display:flex;flex-direction:column;align-items:flex-start;width:100%">' + hdr + '</div>';
                rowHtml += bbls + '</div></div>';

                var temp = document.createElement('div');
                temp.innerHTML = rowHtml;
                while (temp.firstChild) { cont.appendChild(temp.firstChild); }
            });
        }
        cont.scrollTop = cont.scrollHeight;

        // participants (дедупликация: если игрок записан и под ником, и под email — показываем один раз)
        var allRegs = getRegs().filter(function(r) { return r.tournamentId === activeTournamentId; });
        var umap = {};
        allRegs.forEach(function(r) {
            var display = dispName(r.userId);
            var existing = umap[display];
            if (!existing) {
                umap[display] = { name: r.userId, display: display, role: r.role || 'member', teamName: r.teamName };
            } else {
                // Предпочитаем запись с настоящим ником (не email) и ролью капитана
                var prefer = false;
                if (String(existing.name).indexOf('@') !== -1 && String(r.userId).indexOf('@') === -1) prefer = true;
                else if (existing.role !== 'captain' && r.role === 'captain') prefer = true;
                else if (!existing.teamName && r.teamName) prefer = true;
                if (prefer) { umap[display] = { name: r.userId, display: display, role: r.role || 'member', teamName: r.teamName }; }
            }
        });
        var parts = Object.keys(umap).map(function(k) { return umap[k]; });
        parts.sort(function(a, b) { if (a.role === 'captain' && b.role !== 'captain') return -1; if (a.role !== 'captain' && b.role === 'captain') return 1; return 0; });

        var hdr2 = document.querySelector('#chat-users').previousElementSibling;
        if (hdr2) hdr2.textContent = 'Участники (' + parts.length + ')';

        var usersEl = $id('chat-users');
        if (usersEl) {
            usersEl.innerHTML = parts.map(function(u) {
                var adm = u.name === 'Taki' || dispName(u.name) === 'Taki';
                var p = getProf(u.name), dn = dispName(u.name);
                var avs = p.avatarImage
                    ? '<img src="' + esc(p.avatarImage) + '" style="width:22px;height:22px;border-radius:50%;object-fit:cover;display:block;flex-shrink:0">'
                    : '<div style="width:22px;height:22px;border-radius:50%;background:' + esc(p.bgColor || '#3A3F4B') + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0;line-height:1">' + esc(dn.charAt(0).toUpperCase()) + '</div>';
                var tb = u.teamName ? '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">&laquo;' + esc(u.teamName) + '&raquo;</div>' : '';
                return '<div style="display:flex;flex-direction:column;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:8px;border-left:3px solid ' + (u.role === 'captain' ? 'var(--accent)' : 'transparent') + '">' +
                    '<div style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:' + (adm ? 'var(--accent)' : 'var(--text)') + ';cursor:pointer" class="profile-link" data-user="' + esc(u.name) + '">' +
                    avs + (u.role === 'captain' ? '<span style="font-size:9px;color:#F59E0B;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.2);padding:1px 6px;border-radius:4px;font-weight:600;margin-right:4px;vertical-align:middle">Капитан</span>' : '') + esc(dn) +
                    (adm ? ' <span class="admin-golden admin-golden--sm">Админ</span>' : '') +
                    '</div>' + tb +
                '</div>';
            }).join('');
        }

        // unread badge
        if (activeTab !== 'organizer' && activeTournamentId) {
            try {
                var rd = JSON.parse(localStorage.getItem('nexora_organizer_read')) || {};
                var lastRead = rd[activeTournamentId] || '0';
                var unread = all.filter(function(m) {
                    if (m.tournamentId !== activeTournamentId) return false;
                    if ((m.chatType || 'general') !== 'organizer') return false;
                    if (!m.isAdmin) return false;
                    if (m.timestamp <= lastRead) return false;
                    if (m.targetUserId === u.nickname) return true;
                    if (userTeamName && m.teamName === userTeamName) return true;
                    return false;
                }).length;
                var badge = $id('organizer-unread-badge');
                if (badge) { if (unread > 0) { badge.textContent = unread > 99 ? '99+' : unread; badge.style.display = 'flex'; } else { badge.style.display = 'none'; } }
            } catch(e) {}
        }
    }

    function sendMsg() {
        var u = getUser();
        if (!u || !activeTournamentId) return;
        // Защита: писать в чат могут только оплатившие участники турнира
        var acc = chatAccess(u, activeTournamentId);
        if (acc === 'not-paid') { alert('Вы не можете писать в чат, так как вы ещё не состоите в турнире.'); return; }
        if (acc !== 'ok') { window.closeChat(); return; }
        var inp = $id('chat-input'); if (!inp) return;
        var txt = inp.value.trim(); if (!txt) return;
        if (txt.length > 500) txt = txt.substring(0, 500);
        var regs = getRegs(), tn = '';
        for (var i = 0; i < regs.length; i++) { if (regs[i].userId === u.nickname && regs[i].tournamentId === activeTournamentId) { if (regs[i].teamName) tn = regs[i].teamName; break; } }
        var all = getMsgs();
        // Всегда сохраняем ник, а не email
        var senderId = u.nickname || resolveNick(u.email || '');
        var senderIsAdmin = u.nickname === 'Taki' || u.email === 'anfajue@bk.ru' || (function() { try { var r = JSON.parse(localStorage.getItem('nexora_roles')) || {}; return r[u.nickname] === 'admin'; } catch(e) { return false; } })();
        var msg = { tournamentId: activeTournamentId, userId: senderId, text: txt, timestamp: new Date().toISOString(), isAdmin: senderIsAdmin, chatType: activeTab === 'organizer' ? 'organizer' : activeTab, teamName: tn || undefined };
        if (chatReplyToUser) { msg.targetUserId = chatReplyToUser; msg.replyToText = chatReplyToText; }
        all.push(msg);
        chatReplyToUser = null; chatReplyToText = null;
        var ri = $id('chat-reply-indicator'); if (ri) ri.style.display = 'none';
        saveMsgs(all); inp.value = ''; renderChat();
    }

    // --- floating button ---
    var fbtn = document.createElement('button');
    fbtn.className = 'floating-chat-btn';
    fbtn.setAttribute('aria-label', 'Чат');
    fbtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    document.body.appendChild(fbtn);

    // Кнопка чата видна только когда у игрока есть активная заявка в турнире.
    // Незалогиненным и вышедшим из турнира — кнопка скрыта.
    function updateFloatingChat() {
        var u = getUser(), has = false;
        if (u) {
            var regs = getRegs();
            for (var i = 0; i < regs.length; i++) { if (regs[i].userId === u.nickname && !isInLeftList(u, regs[i].tournamentId)) { has = true; break; } }
        }
        fbtn.style.display = has ? '' : 'none';
    }
    updateFloatingChat();
    window.addEventListener('focus', updateFloatingChat);
    window.addEventListener('storage', updateFloatingChat);
    window.addEventListener('nexora:auth', updateFloatingChat);

    fbtn.addEventListener('click', function() {
        var u = getUser();
        if (!u) { alert('Войдите в аккаунт'); return; }
        var regs = getRegs(), myReg = null;
        for (var i = 0; i < regs.length; i++) { if (regs[i].userId === u.nickname && !isInLeftList(u, regs[i].tournamentId)) { myReg = regs[i]; break; } }
        if (!myReg) {
            alert('У вас нет активных заявок');
            return;
        }
        var tid = myReg.tournamentId, tours = getTours(), tour = null;
        for (var i = 0; i < tours.length; i++) { if (String(tours[i].id) === String(tid)) { tour = tours[i]; break; } }
        window.openChat(tid, tour ? tour.name : 'Чат');
    });

    // --- global openChat / closeChat ---
    window.openChat = function(tournamentId, tournamentName) {
        var u = getUser();
        if (!u) { alert('Войдите в аккаунт'); return; }
        // Проверка доступа: чат только для оплативших участников турнира
        var acc = chatAccess(u, tournamentId);
        if (acc === 'no-reg' || acc === 'left') { alert('Чат турнира доступен только его участникам'); return; }
        if (acc === 'not-paid') { alert('Вы не можете писать в чат, так как вы ещё не состоите в турнире.'); return; }
        // Заголовок чата — название конкретного турнира («Чат — PUBG MOBILE»).
        // Всегда берём имя из хранилища турниров по id (переданное кнопкой имя
        // не приоритетно), чтобы не появлялось «Чат — Чат».
        var resolvedName = null;
        var toursT = getTours();
        for (var j = 0; j < toursT.length; j++) {
            if (String(toursT[j].id) === String(tournamentId)) { resolvedName = toursT[j].name; break; }
        }
        if (!resolvedName) resolvedName = (tournamentName && tournamentName !== 'Чат') ? tournamentName : 'Чат турнира';
        activeTournamentId = tournamentId; activeTab = 'general';
        tabs.forEach(function(t) { t.classList.remove('active'); t.style.color = 'var(--text-muted)'; });
        var genTab = document.querySelector('.chat-tab[data-chat-tab="general"]');
        if (genTab) { genTab.classList.add('active'); genTab.style.color = 'var(--accent)'; }
        var inp = $id('chat-input'); if (inp) inp.placeholder = 'Написать сообщение...';
        var title = $id('chat-modal-title');
        if (title) title.textContent = 'Чат — ' + resolvedName;
        try { var rd = JSON.parse(localStorage.getItem('nexora_organizer_read')) || {}; rd[tournamentId] = new Date().toISOString(); localStorage.setItem('nexora_organizer_read', JSON.stringify(rd)); } catch(e) {}
        renderChat();
        var overlay = $id('modal-overlay');
        if (overlay) overlay.classList.add('active');
        var modal = $id('chat-modal');
        if (modal) modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (inp) inp.focus();
        setTimeout(function() { moveChatInd(document.querySelector('.chat-tab[data-chat-tab=general]')); }, 20);
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(renderChat, 3000);
    };

    window.closeChat = function() {
        var overlay = $id('modal-overlay');
        if (overlay) overlay.classList.remove('active');
        var modal = $id('chat-modal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
        activeTournamentId = null;
        if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
    };

    // --- event listeners ---
    var closeBtn = $id('chat-close');
    if (closeBtn) closeBtn.addEventListener('click', window.closeChat);
    var overlayEl = $id('modal-overlay');
    if (overlayEl) overlayEl.addEventListener('click', function() { var cm = $id('chat-modal'); if (cm && cm.classList.contains('active')) window.closeChat(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') { var cm = $id('chat-modal'); if (cm && cm.classList.contains('active')) window.closeChat(); } });
    var sendBtn = $id('chat-send');
    if (sendBtn) sendBtn.addEventListener('click', sendMsg);
    var inpEl = $id('chat-input');
    if (inpEl) inpEl.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });

    // ---- Reply: делегированный клик по кнопке "Ответить" ----
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.chat-reply-btn');
        if (!btn) return;
        chatReplyToUser = btn.dataset.user;
        chatReplyToText = btn.dataset.text;
        var ri = $id('chat-reply-indicator'), rn = $id('chat-reply-name'), rq = $id('chat-reply-quote');
        if (ri && rn && rq) {
            rn.textContent = dispName(chatReplyToUser);
            rq.textContent = chatReplyToText || '';
            ri.style.display = 'flex';
        }
        var inp = $id('chat-input');
        if (inp) inp.focus();
    });

    // ---- Reply: кнопка отмены ----
    var cancelReplyBtn = $id('chat-reply-cancel');
    if (cancelReplyBtn) cancelReplyBtn.addEventListener('click', function() {
        chatReplyToUser = null; chatReplyToText = null;
        var ri = $id('chat-reply-indicator');
        if (ri) ri.style.display = 'none';
    });

    // ---- Reply: сбрасываем при смене таба ----
    tabs.forEach(function(t) {
        t.addEventListener('click', function() {
            chatReplyToUser = null; chatReplyToText = null;
            var ri = $id('chat-reply-indicator');
            if (ri) ri.style.display = 'none';
        });
    });
})();


// ===========================================
// 10. JOIN REQUESTS — one system for all pages
// ===========================================
(function() {
    if (!document.getElementById('modal-overlay')) {
        var ov = document.createElement('div'); ov.id = 'modal-overlay'; ov.className = 'modal-overlay';
        document.body.appendChild(ov);
    }

    if (!document.getElementById('requests-modal')) {
        var rm = document.createElement('div'); rm.id = 'requests-modal'; rm.className = 'modal modal--wide';
        rm.innerHTML = '<div class="modal__header"><h3 class="modal__title">Заявки в команды</h3><button class="modal__close" id="requests-close">&#10005;</button></div><div class="modal__form" style="padding:20px 24px"><div id="requests-content" style="max-height:65vh;overflow-y:auto"></div></div>';
        document.body.appendChild(rm);
    }

    // --- button already in HTML ---
    var headerActions = document.querySelector('.header__actions');
    var rbtn = document.getElementById('btn-requests');

    function escReq(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    window.updateRequestsBadge = function() {
        var user = null; try { user = JSON.parse(localStorage.getItem('nexora_current_user')); } catch {}
        var badge = document.getElementById('requests-badge');
        var btn = document.getElementById('btn-requests');
        if (!btn || !badge) return;
        if (!user) { btn.style.display = 'none'; return; }
        btn.style.display = '';
        var reqs = []; try { reqs = JSON.parse(localStorage.getItem('nexora_join_requests')) || []; } catch {}
        var regs = []; try { regs = JSON.parse(localStorage.getItem('nexora_registrations')) || []; } catch {}
        var myTeams = regs.filter(function(r) { return r.userId === user.nickname && r.role === 'captain'; });
        var teamIds = myTeams.map(function(t) { return t.teamId; });
        var pendingCount = reqs.filter(function(r) { return teamIds.indexOf(r.teamId) !== -1 && r.status === 'pending'; }).length;
        badge.style.display = pendingCount > 0 ? 'flex' : 'none';
        badge.textContent = pendingCount > 99 ? '99+' : pendingCount;
    };

    function renderPendingRequests(teamId, tournamentId, reqs) {
        var pending = reqs.filter(function(r) { return r.teamId === teamId && r.tournamentId === tournamentId && r.status === 'pending'; });
        if (pending.length === 0) return '<p style="text-align:center;padding:16px;font-size:13px;color:var(--text-muted)">Нет ожидающих заявок</p>';
        var html = '';
        pending.forEach(function(req) {
            html += '<div class="join-request" data-req-id="' + req.id + '" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-size:15px;font-weight:600;color:var(--text);cursor:pointer" class="profile-link" data-user="' + escReq(req.userId) + '">' + escReq(req.userId) + '</div>' +
                    '<div style="font-size:12px;color:var(--text-muted);margin-top:1px">ID: ' + escReq(req.playerId || '—') + '</div>' +
                '</div>' +
                '<button class="req-approve" data-req-id="' + req.id + '" style="padding:8px 20px;border:none;border-radius:6px;background:var(--accent);color:#0A0B0E;font-size:13px;cursor:pointer;font-weight:600;transition:opacity .15s" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">Принять</button>' +
                '<button class="req-reject" data-req-id="' + req.id + '" style="padding:8px 14px;border:none;border-radius:6px;background:#EF4444;color:#fff;font-size:13px;cursor:pointer;font-weight:600;transition:opacity .15s" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'">Нет</button></div>';
        });
        return html;
    }

    window.refreshRequestsList = function() {
        var user = null; try { user = JSON.parse(localStorage.getItem('nexora_current_user')); } catch {}
        if (!user) return;
        var regs = []; try { regs = JSON.parse(localStorage.getItem('nexora_registrations')) || []; } catch {}
        var reqs = []; try { reqs = JSON.parse(localStorage.getItem('nexora_join_requests')) || []; } catch {}
        var tns = []; try { tns = JSON.parse(localStorage.getItem('nexora_tournaments')) || []; } catch {}
        var myTeams = regs.filter(function(r) { return r.userId === user.nickname && r.role === 'captain'; });
        var content = document.getElementById('requests-content');
        if (!content) return;
        if (myTeams.length === 0) {
            content.innerHTML = '<p style="text-align:center;padding:32px 16px;color:var(--text-muted);font-size:14px">Нет команд, в которых вы капитан</p>';
        } else {
            var html = '';
            myTeams.forEach(function(team) {
                var tn = tns.find(function(t) { return t.id === team.tournamentId; });
                var tournName = tn ? tn.name : 'Турнир';
                var tt = tn ? (tn.teamType || 'solo') : 'solo';
                var memberCount = tt === 'duo' ? 2 : tt === 'trio' ? 3 : tt === 'team4' ? 4 : tt === 'team8' ? 8 : 5;
                var teamMembers = regs.filter(function(r) { return r.teamId === team.teamId; });
                html += '<div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;background:var(--surface)">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">' +
                        '<div>' +
                            '<div style="font-size:16px;font-weight:700;color:var(--text)">' + escReq(tournName) + '</div>' +
                            '<div style="font-size:13px;color:var(--accent);font-weight:600;margin-top:3px">«' + escReq(team.teamName) + '» · ' + teamMembers.length + '/' + memberCount + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div data-team-id="' + team.teamId + '" data-tournament-id="' + team.tournamentId + '">' +
                        renderPendingRequests(team.teamId, team.tournamentId, reqs) +
                    '</div></div>';
            });
            content.innerHTML = html;
        }
    };

    function openRequestsModal() {
        var user = null; try { user = JSON.parse(localStorage.getItem('nexora_current_user')); } catch {}
        if (!user) return;
        window.refreshRequestsList();
        document.getElementById('modal-overlay').classList.add('active');
        document.getElementById('requests-modal').classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeRequestsModal() {
        document.getElementById('modal-overlay').classList.remove('active');
        document.getElementById('requests-modal').classList.remove('active');
        document.body.style.overflow = '';
    }

    document.addEventListener('click', function(e) {
        if (e.target.id === 'btn-requests') { openRequestsModal(); return; }
        if (e.target.id === 'requests-close') { closeRequestsModal(); return; }
        var approveBtn = e.target.closest('.req-approve');
        if (approveBtn && typeof window.approveJoinRequest === 'function') {
            window.approveJoinRequest(approveBtn.dataset.reqId);
            window.updateRequestsBadge();
            window.refreshRequestsList();
            return;
        }
        var rejectBtn = e.target.closest('.req-reject');
        if (rejectBtn && typeof window.rejectJoinRequest === 'function') {
            window.rejectJoinRequest(rejectBtn.dataset.reqId);
            window.updateRequestsBadge();
            window.refreshRequestsList();
            return;
        }
    });

    document.getElementById('modal-overlay').addEventListener('click', function() {
        var rm = document.getElementById('requests-modal');
        if (rm && rm.classList.contains('active')) closeRequestsModal();
    });
    document.addEventListener('keydown', function(e) {
        var rm = document.getElementById('requests-modal');
        if (e.key === 'Escape' && rm && rm.classList.contains('active')) closeRequestsModal();
    });

    window.updateRequestsBadge();
    setInterval(window.updateRequestsBadge, 5000);
})();


// ===========================================
// 11. PROFILE VIEW — works on all pages
// ===========================================
(function() {
    if (!document.getElementById('modal-overlay')) {
        var ov = document.createElement('div'); ov.id = 'modal-overlay'; ov.className = 'modal-overlay';
        document.body.appendChild(ov);
    }

    if (!document.getElementById('profile-view-modal')) {
        var pm = document.createElement('div'); pm.id = 'profile-view-modal'; pm.className = 'modal modal--wide';
        pm.innerHTML = '<div class="modal__header"><h3 class="modal__title" id="profile-view-title">Профиль игрока</h3><button class="modal__close" id="profile-view-close">&#10005;</button></div><div class="modal__form" style="padding:20px 24px"><div id="profile-view-content" style="max-height:65vh;overflow-y:auto"></div></div>';
        document.body.appendChild(pm);
    }

    var PROFILE_COLORS = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9'];

    function escP(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function getProfileData(nickname) {
        if (!nickname) return { avatar: '', bgColor: '#3A3F4B', bio: '', avatarImage: null, wins: 0, losses: 0 };
        try {
            var all = JSON.parse(localStorage.getItem('nexora_profiles'));
            if (all && all[nickname]) return all[nickname];
        } catch(e) {}
        var hash = 0;
        for (var i = 0; i < nickname.length; i++) { hash = nickname.charCodeAt(i) + ((hash << 5) - hash); }
        var p = { avatar: '', bgColor: PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length], bio: '', avatarImage: null, wins: 0, losses: 0 };
        try { var a = JSON.parse(localStorage.getItem('nexora_profiles')) || {}; a[nickname] = p; localStorage.setItem('nexora_profiles', JSON.stringify(a)); } catch(e) {}
        return p;
    }

    function calcPlayed(nickname) {
        try {
            var regs = JSON.parse(localStorage.getItem('nexora_registrations')) || [];
            var tns = JSON.parse(localStorage.getItem('nexora_tournaments')) || [];
            var count = 0;
            regs.forEach(function(r) {
                if (r.userId === nickname) {
                    var tn = tns.find(function(t) { return t.id === r.tournamentId; });
                    if (tn && (tn.status === 'completed' || tn.status === 'active')) count++;
                }
            });
            return count;
        } catch(e) { return 0; }
    }

    function renderAvatarP(profile, size) {
        size = size || 80;
        if (profile.avatarImage) {
            return '<img src="' + escP(profile.avatarImage) + '" alt="" style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;display:block;margin:0 auto;box-shadow:0 4px 16px rgba(0,0,0,.3)">';
        }
        return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + escP(profile.bgColor) + ';margin:0 auto;box-shadow:0 4px 16px rgba(0,0,0,.3)"></div>';
    }

    if (!window.openProfile) {
        window.openProfile = function(nickname) {
            if (!nickname) return;
            var content = document.getElementById('profile-view-content');
            if (!content) return;
            var profile = getProfileData(nickname);
            var tournamentsPlayed = calcPlayed(nickname);
            var cur = null; try { cur = JSON.parse(localStorage.getItem('nexora_current_user')); } catch(e) {}

            content.innerHTML =
                '<div style="text-align:center;padding:8px 0 16px">' +
                    renderAvatarP(profile, 90) +
                    '<h2 style="font-size:20px;font-weight:700;color:var(--text);margin:14px 0 4px">' + escP(nickname) + '</h2>' +
                    (profile.bio ? '<p style="font-size:13px;color:var(--text-muted);margin:4px auto 0;max-width:280px">' + escP(profile.bio) + '</p>' : '') +
                '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">' +
                    '<div style="text-align:center;padding:14px 8px;background:var(--surface);border:1px solid var(--border);border-radius:10px">' +
                        '<div style="font-size:22px;font-weight:700;color:var(--accent)">' + tournamentsPlayed + '</div>' +
                        '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;font-weight:500">Турниров</div>' +
                    '</div>' +
                    '<div style="text-align:center;padding:14px 8px;background:var(--surface);border:1px solid var(--border);border-radius:10px">' +
                        '<div style="font-size:22px;font-weight:700;color:#FFFFFF">' + (profile.wins || 0) + '</div>' +
                        '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;font-weight:500">Побед</div>' +
                    '</div>' +
                    '<div style="text-align:center;padding:14px 8px;background:var(--surface);border:1px solid var(--border);border-radius:10px">' +
                        '<div style="font-size:22px;font-weight:700;color:#EF4444">' + (profile.losses || 0) + '</div>' +
                        '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;font-weight:500">Поражений</div>' +
                    '</div>' +
                '</div>';

            document.getElementById('profile-view-title').textContent = '\u041f\u0440\u043e\u0444\u0438\u043b\u2014 ' + nickname;
            document.getElementById('modal-overlay').classList.add('active');
            document.getElementById('profile-view-modal').classList.add('active');
            document.getElementById('profile-view-modal').style.zIndex = '2101';
            document.body.style.overflow = 'hidden';
        };
    }

    function closeProfileModal() {
        document.getElementById('modal-overlay').classList.remove('active');
        var pm = document.getElementById('profile-view-modal');
        if (pm) { pm.classList.remove('active'); pm.style.zIndex = ''; }
        document.body.style.overflow = '';
    }

    document.addEventListener('click', function(e) {
        if (e.target.id === 'profile-view-close') { closeProfileModal(); }
    });

    document.getElementById('modal-overlay').addEventListener('click', function() {
        var pm = document.getElementById('profile-view-modal');
        if (pm && pm.classList.contains('active')) closeProfileModal();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            var pm = document.getElementById('profile-view-modal');
            if (pm && pm.classList.contains('active')) closeProfileModal();
        }
    });
})();
