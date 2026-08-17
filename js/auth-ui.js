// auth-ui.js — лёгкая шапка авторизации для статических страниц
// (news/rating/faq/contacts/policy/terms), где нет полных модалок входа.
// Полные модалки живут на index.html/tournaments.html — кнопки ведут туда.
// Вход/Регистрация открывают модалку через ?auth=login|register на главной,
// «Личный кабинет» — модалку профиля (?auth=profile).
(function () {
    'use strict';

    function $id(x) { return document.getElementById(x); }

    var btnRegister = $id('btn-register');
    var btnLogin = $id('btn-login');
    var profileWrap = $id('profile-wrap');
    var btnProfile = $id('btn-profile');
    var profileDropdown = $id('profile-dropdown');
    var profileInfo = $id('profile-info');
    var adminLink = $id('admin-link');
    var btnLogout = $id('btn-logout');
    var btnProfileLink = $id('btn-profile-link');

    // Если на странице нет шапки авторизации — ничего не делаем
    if (!btnRegister || !btnLogin || !profileWrap || !btnProfile || !profileDropdown) return;

    function getCurrentUser() {
        try { return JSON.parse(localStorage.getItem('nexora_current_user')); } catch (e) { return null; }
    }

    function render() {
        var user = getCurrentUser();
        var loggedIn = !!user;
        btnRegister.style.display = loggedIn ? 'none' : '';
        btnLogin.style.display = loggedIn ? 'none' : '';
        profileWrap.style.display = loggedIn ? '' : 'none';
        if (loggedIn && profileInfo) {
            profileInfo.textContent = user.nickname || user.email || 'Пользователь';
        }
        // Админ-панель — только для админов/организаторов (как в script.js)
        if (adminLink) {
            var show = false;
            var nick = user && user.nickname;
            var email = user && user.email;
            try {
                var roles = JSON.parse(localStorage.getItem('nexora_roles')) || {};
                if (nick === 'Taki') show = true;
                else if (email === 'anfajue@bk.ru') show = true;
                else if (roles[nick]) show = true;
            } catch (e) {}
            adminLink.style.display = show ? '' : 'none';
        }
    }

    // Выпадающее меню профиля
    btnProfile.addEventListener('click', function (e) {
        e.stopPropagation();
        profileDropdown.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
        if (!profileWrap.contains(e.target)) {
            profileDropdown.classList.remove('open');
        }
    });

    // Выход
    if (btnLogout) {
        btnLogout.addEventListener('click', function () {
            localStorage.removeItem('nexora_current_user');
            try { window.dispatchEvent(new CustomEvent('nexora:auth')); } catch (e) {}
            render();
        });
    }

    // Вход / Регистрация / Личный кабинет → на главную с автооткрытием модалки
    if (btnLogin) btnLogin.addEventListener('click', function (e) { e.preventDefault(); location.href = 'index.html?auth=login'; });
    if (btnRegister) btnRegister.addEventListener('click', function (e) { e.preventDefault(); location.href = 'index.html?auth=register'; });
    if (btnProfileLink) btnProfileLink.addEventListener('click', function (e) { e.preventDefault(); location.href = 'index.html?auth=profile'; });

    // Если авторизация изменилась где-то ещё (например, после выхода) — обновим шапку
    window.addEventListener('nexora:auth', render);

    render();
})();
