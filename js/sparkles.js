// ===========================================
// Фон «Парящие искры» — глобальный слой для всего сайта
// Подключается на каждой странице перед </body>.
// Создаёт один фиксированный canvas поверх вьюпорта,
// pointer-events:none — не мешает кликам и скроллу.
// Оптимизировано: спрайт свечения вместо shadowBlur,
// пониженный DPR, пауза на скрытой вкладке.
// ===========================================
(function () {
    if (!document.body) return;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var canvas = document.createElement('canvas');
    canvas.id = 'nexora-fx';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block';
    document.body.insertBefore(canvas, document.body.firstChild);

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var W = 0, H = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var parts = [];
    var PALETTE = [
        [255, 255, 255],  // белый
        [214, 218, 226],  // светло-серый
        [172, 178, 190]   // серый
    ];

    // Заранее отрисованное мягкое свечение (вместо дорогого shadowBlur каждый кадр)
    var glowSprite = (function () {
        var s = document.createElement('canvas');
        s.width = 48; s.height = 48;
        var g = s.getContext('2d');
        var grad = g.createRadialGradient(24, 24, 1, 24, 24, 24);
        grad.addColorStop(0, 'rgba(255,255,255,0.4)');
        grad.addColorStop(0.45, 'rgba(255,255,255,0.12)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 48, 48);
        return s;
    })();

    function resize() {
        W = window.innerWidth || 1;
        H = window.innerHeight || 1;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        initParts();
    }

    function makePart(below) {
        var c = PALETTE[(Math.random() * PALETTE.length) | 0];
        return {
            x: Math.random() * W,
            y: below ? H + 8 : Math.random() * H,
            r: 0.8 + Math.random() * 2.2,
            c: c,
            glow: Math.random() < 0.28,
            speedY: 0.15 + Math.random() * 0.55,
            drift: 0.3 + Math.random() * 0.8,
            phase: Math.random() * Math.PI * 2,
            twinkle: 0.5 + Math.random() * 1.6,
            t: Math.random() * Math.PI * 2
        };
    }

    function initParts() {
        var count = Math.round(Math.min(45, Math.max(18, (W * H) / 20000)));
        parts = [];
        for (var i = 0; i < count; i++) parts.push(makePart(false));
    }

    function tick() {
        ctx.clearRect(0, 0, W, H);
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            p.y -= p.speedY;
            p.t += 0.016;
            var flicker = 0.55 + 0.45 * Math.sin(p.t * p.twinkle);
            var alpha = Math.min(1, flicker) * 0.85;
            var x = p.x + Math.sin(p.t * 0.6 + p.phase) * p.drift;

            if (p.y < -12) {
                parts[i] = makePart(true);
                continue;
            }

            if (p.glow) {
                ctx.globalAlpha = alpha;
                var sz = p.r * 9;
                ctx.drawImage(glowSprite, x - sz / 2, p.y - sz / 2, sz, sz);
                ctx.globalAlpha = 1;
            } else {
                ctx.globalAlpha = alpha;
                ctx.fillStyle = 'rgb(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ')';
                ctx.beginPath();
                ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
    }

    var raf = null;
    var running = true;
    function loop() {
        tick();
        raf = requestAnimationFrame(loop);
    }
    function start() {
        if (reduced || !running) return;
        if (raf) cancelAnimationFrame(raf);
        loop();
    }
    function stop() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
    }

    resize();
    if (reduced) { tick(); } else { start(); }

    window.addEventListener('resize', function () { resize(); start(); });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { running = false; stop(); }
        else { running = true; start(); }
    });

    // Пауза во время скролла: освобождает compositor, листание становится идеально плавным
    var scrollTimer = null;
    window.addEventListener('scroll', function () {
        stop();
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function () {
            if (!document.hidden) start();
        }, 120);
    }, { passive: true });
})();
