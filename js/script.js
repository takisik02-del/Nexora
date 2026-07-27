/* ===================================================
   NEXORA — Scripts
   =================================================== */

document.addEventListener('DOMContentLoaded', () => {

    'use strict';

    // Init EmailJS
    emailjs.init('Dx0IhVnoksWoXITjb');

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
    window.addEventListener('scroll', () => {
        let current = 'hero';
        sections.forEach(sec => {
            if (window.scrollY >= sec.offsetTop - 150) current = sec.id;
        });
        navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + current));
    }, { passive: true });

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
                adminLink.style.display = currentUser.nickname === 'Taki' ? '' : 'none';
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

    function showVerificationUI() {
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
            <div class="form-group" style="max-width:200px;margin:0 auto 16px">
                <label class="form-label">Введите код из письма</label>
                <input type="text" class="form-input" id="reg-verify-code" placeholder="000000" maxlength="6" style="text-align:center;font-size:20px;font-weight:700;letter-spacing:4px;font-family:var(--font-mono)">
            </div>
            <button type="submit" class="btn btn--primary btn--full">Подтвердить регистрацию</button>
        `;
        registerForm.appendChild(verification);
        setTimeout(() => document.getElementById('reg-verify-code')?.focus(), 100);
    }

    registerForm.addEventListener('submit', e => {
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

            // Generate one-time code and save pending
            const code = generateCode();
            pendingReg = {
                nickname: nick.value.trim(),
                email: email.value.trim(),
                password: pass.value,
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

            // Send email via EmailJS
            emailjs.send('service_m91dbvn', 'template_v73z4rf', {
                to_email: pendingReg.email,
                to_name: pendingReg.nickname,
                code: pendingReg.code
            }).then(() => {
                // Email sent — show verification UI
                submitBtn.textContent = origText;
                submitBtn.disabled = false;
                showVerificationUI();
            }, err => {
                console.error('EmailJS error:', err);
                submitBtn.textContent = origText;
                submitBtn.disabled = false;
                showFormError(registerForm, 'Ошибка отправки письма. Попробуйте ещё раз');
                // Clean up pending
                const list = getPendingRegistrations();
                savePendingRegistrations(list.filter(p => p.email !== pendingReg.email));
                pendingReg = null;
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
            btn.textContent = '✓ Готово';
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
    document.getElementById('login-form').addEventListener('submit', e => {
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
        const user = users.find(u =>
            (u.email === loginValue || u.nickname === loginValue) &&
            u.password === passField.value
        );

        if (!user) {
            showFormError(e.target, 'Неверный email/никнейм или пароль');
            return;
        }

        currentUser = user;
        localStorage.setItem('nexora_current_user', JSON.stringify(currentUser));
        const btn = e.target.querySelector('[type="submit"]');
        const orig = btn.textContent;
        btn.textContent = '✓ Готово';
        btn.disabled = true;
        setTimeout(() => {
            btn.textContent = orig;
            btn.disabled = false;
            isLoggedIn = true;
            updateAuthUI();
            closeModal();
        }, 600);
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
    // 6b. Restore session across pages
    // ===========================================
    const savedUser = (() => { try { return JSON.parse(localStorage.getItem('nexora_current_user')); } catch { return null; } })();
    if (savedUser) {
        currentUser = savedUser;
        isLoggedIn = true;
    }
    updateAuthUI();

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
        // Toggle SVGs: show eye-off when visible, eye when hidden
        const eyeSvg = btn.querySelector('.pw-eye');
        const eyeOffSvg = btn.querySelector('.pw-eye-off');
        if (eyeSvg) eyeSvg.style.display = isPassword ? 'none' : '';
        if (eyeOffSvg) eyeOffSvg.style.display = isPassword ? '' : 'none';
    });

    console.log('🚀 Nexora v4 loaded');
});
