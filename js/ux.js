/* ===========================================
   NEXORA — UX-слой
   scroll-reveal · счётчики · динамическое сканирование
   Подключается на каждой странице перед </body>.
   Уважает prefers-reduced-motion.
   =========================================== */
(function () {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.documentElement.classList.add('nx-ux');

    // Селекторы блоков, которые «всплывают» при появлении в вьюпорте
    var REVEAL_SELECTOR = '[data-reveal],.section__header,.about-card,.about-value,.game-card,.tournament-card,.news-card,.profile-stat-card,.stat-card,.faq-item,.page-head,.admin-card,.topic-grid > *,.ticket,.winners-card,.footer__col,.feature-card,.section--alt .container';

    var seen = new Set();

    function observeAll() {
        var nodes = document.querySelectorAll(REVEAL_SELECTOR);
        for (var i = 0; i < nodes.length; i++) {
            if (seen.has(nodes[i])) continue;
            seen.add(nodes[i]);
            observeNode(nodes[i]);
        }
    }

    function observeNode(el) {
        if (reduced) { el.classList.add('revealed'); return; }
        if (window.IntersectionObserver) {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                    if (en.isIntersecting) {
                        en.target.classList.add('revealed');
                        io.unobserve(en.target);
                    }
                });
            }, { threshold: 0.1, rootMargin: '0px 0px -36px 0px' });
            io.observe(el);
        } else {
            el.classList.add('revealed');
        }
    }

    window.NXReveal = observeAll;

    // ===== Счётчики [data-count-to] =====
    function animateCounter(el) {
        var target = parseFloat(el.getAttribute('data-count-to'));
        if (isNaN(target)) return;
        var started = el.getAttribute('data-count-done');
        if (started) return;
        el.setAttribute('data-count-done', '1');

        var dur = 900;
        var t0 = null;
        var fmt = el.getAttribute('data-count-fmt');
        function format(v) {
            var n = Math.round(v);
            var s = n.toLocaleString('ru-RU');
            if (fmt === 'rub') s += ' ₽';
            return s;
        }
        function frame(ts) {
            if (!t0) t0 = ts;
            var p = Math.min(1, (ts - t0) / dur);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = format(target * eased);
            if (p < 1) requestAnimationFrame(frame);
            else el.textContent = format(target);
        }
        requestAnimationFrame(frame);
    }

    function scanCounters() {
        var nodes = document.querySelectorAll('[data-count-to]');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (el.getAttribute('data-count-done')) continue;
            (function (node) {
                if (reduced) { node.textContent = formatStatic(node); return; }
                if (window.IntersectionObserver) {
                    var io = new IntersectionObserver(function (entries) {
                        entries.forEach(function (en) {
                            if (en.isIntersecting) {
                                io.unobserve(en.target);
                                animateCounter(en.target);
                            }
                        });
                    }, { threshold: 0.4 });
                    io.observe(node);
                } else {
                    animateCounter(node);
                }
            })(el);
        }
    }

    function formatStatic(el) {
        var target = parseFloat(el.getAttribute('data-count-to'));
        var s = (isNaN(target) ? el.textContent : Math.round(target).toLocaleString('ru-RU'));
        if (el.getAttribute('data-count-fmt') === 'rub') s += ' ₽';
        return s;
    }

    window.NXCounters = scanCounters;

    // Первичное сканирование + подхват динамических элементов
    observeAll();
    scanCounters();

    var deb = null;
    var mo = window.MutationObserver && new MutationObserver(function () {
        clearTimeout(deb);
        deb = setTimeout(function () { observeAll(); scanCounters(); }, 120);
    });
    if (mo) mo.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('nexora:auth', function () { observeAll(); scanCounters(); });
})();
