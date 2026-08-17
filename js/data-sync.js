// data-sync.js v5 — синхронизация Nexora между браузерами
// - push: fetch + keepalive (не блокирует UI)
// - pull: sync XHR (должен завершиться до загрузки страницы)
// - polling: каждые 10 секунд тянет с сервера
(function() {
    'use strict';

    var SAVE_URL = '/api/save';
    var LOAD_URL = '/api/load';
    var PREFIX = 'nexora_';
    var PUSH_INTERVAL = 2000;
    var POLL_INTERVAL = 5000;
    // Открытие через файл (file://): сервера нет, работаем только с localStorage
    var IS_FILE = window.location.protocol === 'file:';
    var EXCLUDED_KEYS = {
        'nexora_current_user': true, // сессионные ключи — не синхронизируем
        'nexora_admin_token': true   // ключ доступа — только в localStorage браузера, не на сервер
    };

    var origSetItem = Storage.prototype.setItem;
    var pushTimer = null;
    var lastPush = 0;
    // Ключи, которые только что изменили локально и ещё не подтвердил сервер.
    // Пока ключ «грязный», поллинг не затирает его серверным значением.
    var dirtyKeys = {};

    function getAll() {
        var data = {};
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(PREFIX) === 0 && !EXCLUDED_KEYS[k]) {
                try { data[k] = JSON.parse(localStorage.getItem(k)); }
                catch(e) { data[k] = localStorage.getItem(k); }
            }
        }
        return data;
    }

    function setAllSilent(data) {
        if (!data || typeof data !== 'object') return 0;
        var count = 0;
        for (var k in data) {
            if (data.hasOwnProperty(k) && k.indexOf(PREFIX) === 0 && data[k] !== null && !EXCLUDED_KEYS[k]) {
                var val = typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k]);
                try { origSetItem.call(localStorage, k, val); count++; }
                catch(e) { console.warn('[Nexora] не смог записать ключ (квота?):', k, e && e.message); }
            }
        }
        return count;
    }

    // ===== PUSH (fetch + keepalive) =====
    // Админский токен (nexora_admin_token) подставляется, если он задан —
    // без него запросы с админскими ключами сервер отклоняет (403).
    function getAdminToken() {
        try { return localStorage.getItem('nexora_admin_token') || ''; } catch(e) { return ''; }
    }
    function pushToServer() {
        if (IS_FILE) return;
        var d = getAll();
        if (Object.keys(d).length === 0) return;
        var tk = getAdminToken();
        var headers = { 'Content-Type': 'application/json' };
        if (tk) headers['X-Admin-Token'] = tk;
        try {
            // keepalive убран намеренно: Fetch ограничивает keepalive-запросы 64 КБ,
            // а тело пуша с фото/видео в новостях легко превышает этот лимит.
            fetch(SAVE_URL, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(d)
            }).then(function(r) {
                if (r.ok) {
                    // Сервер принял данные — локальные изменения подтверждены,
                    // поллинг больше не должен затирать их серверным состоянием.
                    for (var k in d) { if (d.hasOwnProperty(k)) delete dirtyKeys[k]; }
                } else if (r.status === 403) {
                    // Сервер отклонил запись: неверный ключ доступа администратора.
                    // Раньше это было тихим провалом — публикация «растворилась».
                    console.warn('[Nexora] push rejected (403): неверный ключ доступа администратора. Проверьте Настройки → Ключ доступа.');
                    if (!window.__nexoraTokenWarned) {
                        window.__nexoraTokenWarned = true;
                        try {
                            alert('Сервер отклонил запись данных: неверный ключ доступа администратора.\nОткройте Настройки → «Ключ доступа» и вставьте ключ из консоли сервера (или из переменных окружения на Vercel).');
                        } catch(e) {}
                    }
                } else {
                    console.warn('[Nexora] push status:', r.status);
                }
            }).catch(function(e) {
                console.warn('[Nexora] push failed:', e);
            });
        } catch(e) {
            console.warn('[Nexora] push error:', e);
        }
    }

    // Debounced push — не спамим сервер на каждый setItem
    function debouncedPush() {
        var now = Date.now();
        if (now - lastPush < 300) return; // не чаще чем раз в 300мс
        lastPush = now;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(pushToServer, 50);
    }

    // ===== PULL (асинхронный fetch с повторной попыткой) =====
    async function pullFromServer() {
        if (IS_FILE) return false;
        for (var attempt = 0; attempt < 3; attempt++) {
            try {
                var resp = await fetch(LOAD_URL, { cache: 'no-store' });
                if (resp.ok) {
                    var data = await resp.json();
                    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                        Storage.prototype.setItem = origSetItem;
                        var count = setAllSilent(data);
                        Storage.prototype.setItem = syncedSetItem;
                        return count > 0;
                    }
                }
            } catch(e) {
                if (attempt < 2) await new Promise(function(r) { setTimeout(r, 500); });
            }
        }
        return false;
    }

    // ===== ПОЛЛИНГ (асинхронный fetch) =====
    function startPolling() {
        if (IS_FILE) return;
        setInterval(async function() {
            try {
                var resp = await fetch(LOAD_URL, { cache: 'no-store' });
                if (!resp.ok) return;
                var data = await resp.json();
                if (data && typeof data === 'object') {
                    var localKeys = {};
                    for (var i = 0; i < localStorage.length; i++) {
                        var k = localStorage.key(i);
                        if (k && k.indexOf(PREFIX) === 0) localKeys[k] = true;
                    }
                    var newData = {};
                    for (var k in data) {
                        if (data.hasOwnProperty(k) && k.indexOf(PREFIX) === 0 && data[k] !== null && !EXCLUDED_KEYS[k]) {
                            try {
                                if (dirtyKeys[k] && (Date.now() - dirtyKeys[k]) < 15000) continue;
                                var localVal = localStorage.getItem(k);
                                var serverVal = typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k]);
                                if (localVal !== serverVal) newData[k] = data[k];
                            } catch(e) {}
                        }
                    }
                    if (Object.keys(newData).length > 0) {
                        Storage.prototype.setItem = origSetItem;
                        setAllSilent(newData);
                        Storage.prototype.setItem = syncedSetItem;
                        rerenderDynamic();
                    }
                }
            } catch(e) {}
        }, POLL_INTERVAL);
    }

    // ===== ХУК setItem =====
    function syncedSetItem(key, value) {
        origSetItem.call(this, key, value);
        if (key && key.indexOf(PREFIX) === 0) {
            dirtyKeys[key] = Date.now();
            debouncedPush();
        }
    }

    // ===== Локальная запись без триггера пуша =====
    // Используется для установки дефолтных данных при первой загрузке
    window.setNexoraLocal = function(key, value) {
        if (key && key.indexOf(PREFIX) === 0) {
            origSetItem.call(localStorage, key, value);
        }
    };

    // Перерисовать динамические блоки страницы после того, как пришли
    // свежие данные с сервера (тикеты, турниры). Страницы сами
    // выставляют window.renderMyTickets / window.renderAdminTickets.
    function rerenderDynamic() {
        try {
            if (window.renderMyTickets) window.renderMyTickets();
            if (window.renderAdminTickets) window.renderAdminTickets();
            if (window.refreshTournaments) window.refreshTournaments();
            if (window.renderTournaments) window.renderTournaments();
        } catch (e) {}
    }

    // ===== РЕЖИМ ФОРСИРОВАННОЙ СИНХРОНИЗАЦИИ =====
    if (window.location.search.indexOf('force-sync') !== -1) {
        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(PREFIX) === 0) keysToRemove.push(k);
        }
        keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
        var cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
        window.location.replace(cleanUrl);
        return;
    }

    // ===== ИНИЦИАЛИЗАЦИЯ =====

    // 1. Ставим хук setItem (сразу, чтобы не терять локальные изменения)
    Storage.prototype.setItem = syncedSetItem;

    // 2. Тянем свежие данные с сервера (асинхронно, не блокируя страницу)
    pullFromServer().then(function() {
        rerenderDynamic();
        // 3. Пушим текущее состояние на сервер
        pushToServer();
        // 4. Запускаем поллинг
        startPolling();
    });

    // 5. При закрытии — сохраняем
    window.addEventListener('beforeunload', function() {
        if (IS_FILE) return;
        var d = getAll();
        if (Object.keys(d).length === 0) return;
        var tk = getAdminToken();
        if (tk) d.token = tk;
        try {
            navigator.sendBeacon(SAVE_URL, JSON.stringify(d));
        } catch(e) {}
    });

})();
