/* ==========================================================
   ECLIPSE VERIFY - Unified Site Scripts, Navigation & Auth System
   ========================================================== */
(function () {
  'use strict';

  // 1. Reveal-on-scroll using IntersectionObserver
  document.documentElement.classList.add('js');
  var revealEls = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (e) { io.observe(e); });
  } else {
    revealEls.forEach(function (e) { e.classList.add('in'); });
  }

  // 2. Dynamic Active Navigation State
  function updateActiveNav() {
    var path = window.location.pathname.split('/').pop() || 'index.html';
    if (path === '') path = 'index.html';
    
    var navLinks = document.querySelectorAll('nav.main a');
    navLinks.forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      var linkPath = href.split('#')[0].split('?')[0];
      
      // Match current page or index
      if (linkPath === path || (path === 'index.html' && (linkPath === '' || linkPath === './' || linkPath === 'index.html'))) {
        link.classList.add('active');
      } else if (path === 'demo.html' && linkPath === 'verify.html') {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  // 3. Mobile Navigation Toggle & Outside Click
  function initMobileNav() {
    var navToggle = document.querySelector('.nav-toggle');
    if (navToggle) {
      navToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        document.body.classList.toggle('nav-open');
      });
    }

    document.addEventListener('click', function (e) {
      if (document.body.classList.contains('nav-open')) {
        var siteNav = document.querySelector('.site-nav');
        if (siteNav && !siteNav.contains(e.target)) {
          document.body.classList.remove('nav-open');
        }
      }
    });

    // Close on nav link click
    document.querySelectorAll('nav.main a').forEach(function(a) {
      a.addEventListener('click', function() {
        document.body.classList.remove('nav-open');
      });
    });
  }

  // 4. Hero Demo Ring Animation on Landing Page
  var arc = document.getElementById('mockArc');
  if (arc) {
    setTimeout(function () {
      if (arc.style.strokeDashoffset !== '275') {
        arc.style.strokeDashoffset = '50';
      }
    }, 450);
  }

  /* ---------- Light / Dark Theme Switcher ---------- */
  var THEME_KEY = 'ev_theme';

  function getTheme() {
    var stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return 'light'; // Default to light mode
  }

  function applyTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') theme = 'light';
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    
    var toggles = document.querySelectorAll('#themeToggle, .theme-toggle');
    toggles.forEach(function (btn) {
      if (theme === 'dark') {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        btn.setAttribute('title', 'Switch to Light Mode');
        btn.setAttribute('aria-label', 'Switch to Light Mode');
      } else {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        btn.setAttribute('title', 'Switch to Dark Mode');
        btn.setAttribute('aria-label', 'Switch to Dark Mode');
      }
    });
  }

  function initTheme() {
    var theme = getTheme();
    applyTheme(theme);
    
    var toggles = document.querySelectorAll('#themeToggle, .theme-toggle');
    toggles.forEach(function (btn) {
      if (!btn._hasThemeListener) {
        btn._hasThemeListener = true;
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var current = document.documentElement.getAttribute('data-theme') || 'dark';
          var next = (current === 'dark') ? 'light' : 'dark';
          applyTheme(next);
        });
      }
    });

    if (window.matchMedia && !window._hasColorSchemeListener) {
      window._hasColorSchemeListener = true;
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (!localStorage.getItem(THEME_KEY)) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  /* ---------- User Auth State & Modal Management ---------- */
  var USERS_KEY = 'ev_users';
  var SESSION_KEY = 'ev_session';

  function seedUsers() {
    var u = localStorage.getItem(USERS_KEY);
    if (u) return {};
    var seed = { 'admin@eclipse.verify': { name: 'Admin', pass: 'pass1234' } };
    localStorage.setItem(USERS_KEY, JSON.stringify(seed));
    return seed;
  }

  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || seedUsers(); }
    catch (e) { return seedUsers(); }
  }
  function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }

  function mountAuth() {
    var zone = document.getElementById('authZone');
    if (!zone) return;
    var s = getSession();
    if (s) {
      zone.innerHTML = '<button class="btn btn-ghost btn-sm" id="userChip" title="Click to sign out">' +
        (s.name || s.email.split('@')[0]) + ' (Sign out)</button>';
      zone.firstChild.addEventListener('click', function () {
        clearSession();
        mountAuth();
        toast('Signed out successfully');
      });
    } else {
      zone.innerHTML = '<button class="btn btn-ghost btn-sm" id="btnSignin">Sign in</button>';
      zone.firstChild.addEventListener('click', function () { openAuth('signin'); });
    }
  }

  var overlay = null;

  function openAuth(tab) {
    if (!document.getElementById('authOverlay')) buildAuth();
    overlay.classList.add('open');
    switchTab(tab || 'signin');
    setTimeout(function () {
      var input = overlay.querySelector('input:not([hidden])');
      if (input) input.focus();
    }, 50);
  }
  window.openAuth = openAuth;

  function buildAuth() {
    overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.id = 'authOverlay';
    overlay.innerHTML =
      '<div class="auth-card">' +
        '<div class="auth-head"><h3 style="margin:0;font-size:17px;font-weight:700;">ECLIPSE&nbsp;<span style=\"color:var(--brand);\">VERIFY</span></h3>' +
          '<button class="auth-close" id="authClose" aria-label="Close">&times;</button></div>' +
        '<div class="auth-tabs">' +
          '<button class="auth-tab" data-tab="signin">Sign in</button>' +
          '<button class="auth-tab" data-tab="signup">Sign up</button>' +
        '</div>' +
        '<div class="auth-body" id="authSignin">' +
          '<div class="auth-field"><label>Email</label><input type="email" id="inEmail" placeholder="admin@eclipse.verify" autocomplete="email"></div>' +
          '<div class="auth-field"><label>Password</label><input type="password" id="inPass" placeholder="••••••••" autocomplete="current-password"></div>' +
          '<div class="auth-err" id="signinErr"></div>' +
          '<button class="btn btn-primary auth-submit" id="signinBtn">Sign in</button>' +
          '<div class="auth-hint">Demo account &mdash; <code>admin@eclipse.verify</code> / <code>pass1234</code></div>' +
        '</div>' +
        '<div class="auth-body" id="authSignup" hidden>' +
          '<div class="auth-field"><label>Full name</label><input type="text" id="upName" placeholder="Jane Doe" autocomplete="name"></div>' +
          '<div class="auth-field"><label>Email</label><input type="email" id="upEmail" placeholder="you@company.com" autocomplete="email"></div>' +
          '<div class="auth-field"><label>Password</label><input type="password" id="upPass" placeholder="min 6 characters" autocomplete="new-password"></div>' +
          '<div class="auth-field"><label>Confirm password</label><input type="password" id="upPass2" placeholder="repeat password" autocomplete="new-password"></div>' +
          '<div class="auth-err" id="signupErr"></div>' +
          '<button class="btn btn-primary auth-submit" id="signupBtn">Create account</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeAuth(); });
    overlay.querySelector('#authClose').addEventListener('click', closeAuth);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAuth(); });

    overlay.querySelectorAll('.auth-tab').forEach(function (t) {
      t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); });
    });

    overlay.querySelector('#signinBtn').addEventListener('click', doSignIn);
    overlay.querySelector('#inPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignIn(); });
    overlay.querySelector('#signupBtn').addEventListener('click', doSignUp);
    overlay.querySelector('#upPass2').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignUp(); });
  }

  function switchTab(tab) {
    if (!overlay) return;
    overlay.querySelector('#authSignin').hidden = tab !== 'signin';
    overlay.querySelector('#authSignup').hidden = tab !== 'signup';
    overlay.querySelector('#signinErr').textContent = '';
    overlay.querySelector('#signupErr').textContent = '';
    overlay.querySelectorAll('.auth-tab').forEach(function (t) {
      t.classList.toggle('on', t.getAttribute('data-tab') === tab);
    });
  }

  function closeAuth() { if (overlay) overlay.classList.remove('open'); }

  function field(v, el) { el.classList.toggle('auth-bad', !v); return v; }
  function err(id, msg) { var el = document.getElementById(id); if (el) el.textContent = msg || ''; }

  function doSignIn() {
    var email = (overlay.querySelector('#inEmail').value || '').trim().toLowerCase();
    var pass = overlay.querySelector('#inPass').value || '';
    if (field(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), overlay.querySelector('#inEmail')) &&
        field(pass.length > 0, overlay.querySelector('#inPass'))) {
      var u = getUsers()[email];
      if (u && u.pass === pass) {
        setSession({ email: email, name: u.name });
        closeAuth();
        mountAuth();
        toast('Welcome back, ' + (u.name || email.split('@')[0]) + '!');
      } else {
        err('signinErr', 'Invalid email or password.');
      }
    } else {
      err('signinErr', 'Enter a valid email and password.');
    }
  }

  function doSignUp() {
    var name = (overlay.querySelector('#upName').value || '').trim();
    var email = (overlay.querySelector('#upEmail').value || '').trim().toLowerCase();
    var pass = overlay.querySelector('#upPass').value || '';
    var pass2 = overlay.querySelector('#upPass2').value || '';
    var okE = field(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), overlay.querySelector('#upEmail'));
    var okP = field(pass.length >= 6, overlay.querySelector('#upPass'));
    var okP2 = field(pass === pass2 && pass2.length > 0, overlay.querySelector('#upPass2'));
    if (!(okE && okP && okP2)) { err('signupErr', 'Check all fields (valid email, 6+ char password, matching confirm).'); return; }
    var users = getUsers();
    if (users[email]) { err('signupErr', 'An account already exists for that email — sign in instead.'); return; }
    users[email] = { name: name || email.split('@')[0], pass: pass };
    saveUsers(users);
    setSession({ email: email, name: name || email.split('@')[0] });
    closeAuth();
    mountAuth();
    toast('Account created — welcome, ' + (name || email.split('@')[0]) + '!');
  }

  // Handle direct hash navigation to sign in
  if (window.location.hash === '#signin') {
    setTimeout(function () { openAuth('signin'); }, 300);
  } else if (window.location.hash === '#signup') {
    setTimeout(function () { openAuth('signup'); }, 300);
  }

  // Safe Single Initialization
  function initApp() {
    updateActiveNav();
    initMobileNav();
    initTheme();
    mountAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
