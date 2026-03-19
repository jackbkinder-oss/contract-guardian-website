/* ============================================================
   TOS Guardian — Website Script
   ============================================================ */

// ─── ANALYTICS HELPER ────────────────────────────────────────
function track(name, data) {
    if (typeof window.va === 'function') {
        window.va('event', { name, data });
    }
}

// ─── TRACK CTA CLICKS ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Hero primary CTA
    document.querySelectorAll('.btn-hero-primary, .sticky-mobile-btn, .exit-popup-cta').forEach(el => {
        el.addEventListener('click', () => track('CTA Click', { label: el.textContent.trim().slice(0, 60) }));
    });

    // Nav signup/login
    document.getElementById('signupBtn')?.addEventListener('click', () => track('Nav Signup Click'));
    document.getElementById('loginBtn')?.addEventListener('click', () => track('Nav Login Click'));

    // Pricing CTAs
    document.querySelector('.plan-cta.free-btn')?.addEventListener('click', () => track('Pricing CTA', { plan: 'free' }));
    document.querySelector('.plan-cta.upgrade-btn')?.addEventListener('click', () => track('Pricing CTA', { plan: 'pro' }));

    // Download cards
    document.querySelectorAll('.download-card').forEach(card => {
        card.addEventListener('click', () => {
            const platform = card.querySelector('.download-card-title')?.textContent.trim() || 'unknown';
            track('Download Click', { platform });
        });
    });

    // FAQ opens
    document.querySelectorAll('.faq-question').forEach(q => {
        q.addEventListener('click', () => {
            const text = q.textContent.trim().replace(/\s+/g, ' ').slice(0, 80);
            track('FAQ Opened', { question: text });
        });
    });
});

// ─── TRACK SCROLL DEPTH ──────────────────────────────────────
(function trackScrollDepth() {
    const milestones = [25, 50, 75, 90];
    const reached = new Set();
    window.addEventListener('scroll', () => {
        const scrolled = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
        milestones.forEach(m => {
            if (!reached.has(m) && scrolled >= m) {
                reached.add(m);
                track('Scroll Depth', { percent: m });
            }
        });
    }, { passive: true });
})();

// ─── TRACK SECTION VISIBILITY ────────────────────────────────
(function trackSectionViews() {
    const sections = ['pricing', 'download', 'testimonials', 'faq', 'comparison'];
    const seen = new Set();
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !seen.has(entry.target.id)) {
                seen.add(entry.target.id);
                track('Section View', { section: entry.target.id });
            }
        });
    }, { threshold: 0.3 });
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
    });
})();

// ─── NAV: SCROLL EFFECT ─────────────────────────────────────
const mainNav = document.getElementById('mainNav');
if (mainNav) {
    window.addEventListener('scroll', () => {
        mainNav.classList.toggle('scrolled', window.scrollY > 24);
    }, { passive: true });
}

// ─── NAV: MOBILE TOGGLE ─────────────────────────────────────
const navToggle = document.getElementById('navToggle');
if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('open');
        mainNav.classList.toggle('mobile-open');
    });

    // Close mobile menu when a link is clicked
    document.querySelectorAll('#mainNav .nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('open');
            mainNav.classList.remove('mobile-open');
        });
    });
}

// ─── NAV: ACTIVE LINK HIGHLIGHT ON SCROLL ───────────────────
const navSections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('#mainNav .nav-link');

if (navSections.length && navLinks.length) {
    const highlightNav = () => {
        const scrollPos = window.scrollY + 100;
        navSections.forEach(section => {
            const top = section.offsetTop;
            const bottom = top + section.offsetHeight;
            const id = section.getAttribute('id');
            const link = document.querySelector(`#mainNav .nav-link[href="#${id}"]`);
            if (link) {
                link.classList.toggle('active', scrollPos >= top && scrollPos < bottom);
            }
        });
    };
    window.addEventListener('scroll', highlightNav, { passive: true });
    highlightNav();
}

// ─── FAQ ACCORDION ───────────────────────────────────────────
document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', () => {
        const item = question.closest('.faq-item');
        const isOpen = item.classList.contains('open');

        // Close all open items
        document.querySelectorAll('.faq-item.open').forEach(openItem => {
            openItem.classList.remove('open');
        });

        // Open clicked item (if it wasn't already open)
        if (!isOpen) {
            item.classList.add('open');
        }
    });
});

// ─── FADE-UP INTERSECTION OBSERVER ───────────────────────────
const fadeObserver = new IntersectionObserver(
    (entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                fadeObserver.unobserve(entry.target);
            }
        });
    },
    {
        threshold: 0.12,
        rootMargin: '0px 0px -40px 0px'
    }
);

document.querySelectorAll('.fade-up').forEach(el => {
    fadeObserver.observe(el);
});

// ─── BILLING TOGGLE (PRICING) ───────────────────────────────
const websiteBillingToggle = document.getElementById('websiteBillingToggle');
if (websiteBillingToggle) {
    websiteBillingToggle.addEventListener('change', () => {
        const isAnnual = websiteBillingToggle.checked;
        const toggleWrapper = websiteBillingToggle.closest('.billing-toggle');
        if (toggleWrapper) toggleWrapper.classList.toggle('annual', isAnnual);
        const mode = isAnnual ? 'annual' : 'monthly';
        document.querySelectorAll('.price-amount[data-monthly]').forEach(el => {
            el.textContent = el.dataset[mode];
        });
        document.querySelectorAll('.price-period[data-monthly]').forEach(el => {
            el.textContent = el.dataset[mode];
        });
        document.querySelectorAll('.price-annual-note').forEach(el => {
            el.style.display = isAnnual ? 'block' : 'none';
        });
    });
}

// ─── DOWNLOAD DROPDOWN ──────────────────────────────────────
const downloadToggle = document.getElementById('downloadToggle');
const downloadWrapper = downloadToggle ? downloadToggle.closest('.nav-download-wrapper') : null;
if (downloadToggle && downloadWrapper) {
    downloadToggle.addEventListener('click', (e) => {
        e.preventDefault();
        downloadWrapper.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!downloadWrapper.contains(e.target)) {
            downloadWrapper.classList.remove('open');
        }
    });
}

// ─── HERO MAC DOWNLOAD DROPDOWN ─────────────────────────────
const heroMacToggle = document.getElementById('heroMacToggle');
const heroMacWrapper = heroMacToggle ? heroMacToggle.closest('.hero-download-wrapper') : null;
if (heroMacToggle && heroMacWrapper) {
    heroMacToggle.addEventListener('click', (e) => {
        e.preventDefault();
        heroMacWrapper.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!heroMacWrapper.contains(e.target)) {
            heroMacWrapper.classList.remove('open');
        }
    });
}

// ─── SMOOTH SCROLL FOR ANCHOR LINKS ─────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href');
        if (targetId === '#') return;
        const target = document.querySelector(targetId);
        if (target) {
            e.preventDefault();
            const navHeight = document.getElementById('mainNav') ? document.getElementById('mainNav').offsetHeight : 0;
            const top = target.getBoundingClientRect().top + window.scrollY - navHeight;
            window.scrollTo({ top, behavior: 'smooth' });
        }
    });
});

// ─── STICKY MOBILE CTA ─────────────────────────────────
const stickyMobileCta = document.getElementById('stickyMobileCta');
if (stickyMobileCta) {
    let lastScrollY = 0;
    const showSticky = () => {
        if (window.scrollY > 200) {
            stickyMobileCta.classList.add('visible');
        } else {
            stickyMobileCta.classList.remove('visible');
        }
        lastScrollY = window.scrollY;
    };
    window.addEventListener('scroll', showSticky, { passive: true });
}

// ─── EXIT INTENT POPUP ──────────────────────────────────────
(function initExitPopup() {
    const popup = document.getElementById('exitPopup');
    const closeBtn = document.getElementById('exitPopupClose');
    if (!popup || !closeBtn) return;

    let shown = false;

    function showPopup() {
        if (shown) return;
        if (sessionStorage.getItem('cg_exit_shown')) return;
        if (localStorage.getItem('cg_user')) return; // already signed up
        shown = true;
        sessionStorage.setItem('cg_exit_shown', '1');
        popup.classList.add('active');
    }

    // Desktop: mouse leaves viewport
    document.addEventListener('mouseout', (e) => {
        if (e.clientY <= 0) showPopup();
    });

    // Mobile: back button / scroll to top rapidly (fallback — 30s idle)
    let idleTimer = setTimeout(showPopup, 30000);
    document.addEventListener('scroll', () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(showPopup, 30000);
    }, { passive: true });

    closeBtn.addEventListener('click', () => {
        popup.classList.remove('active');
    });

    popup.addEventListener('click', (e) => {
        if (e.target === popup) popup.classList.remove('active');
    });
})();

// ─── STRIPE CHECKOUT ────────────────────────────────────────
function startCheckout(plan) {
    const user = localStorage.getItem('cg_user');
    if (!user) {
        // Not logged in — send to signup with plan param so they return to checkout after
        window.location.href = `signup.html?plan=${plan}`;
        return;
    }

    const parsed = JSON.parse(user);
    let stripePlan = plan;

    let quantity;
    if (plan === 'payg') {
        const qtyEl = document.getElementById('paygQty');
        quantity = qtyEl ? parseInt(qtyEl.textContent) : 1;
    }
    redirectToStripe(stripePlan, parsed.email, quantity);
}

function changePaygQty(delta) {
    const el = document.getElementById('paygQty');
    if (!el) return;
    let qty = parseInt(el.textContent) + delta;
    if (qty < 1) qty = 1;
    if (qty > 10) qty = 10;
    el.textContent = qty;
}

async function redirectToStripe(plan, email, quantity) {
    try {
        const body = { plan, email };
        if (quantity) body.quantity = quantity;

        const res = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.error || 'Failed to start checkout.');
            return;
        }

        const { url } = await res.json();
        window.location.href = url;
    } catch (e) {
        console.error('Checkout error:', e);
        alert('Something went wrong. Please try again.');
    }
}

// On page load, check if redirected back after auth with a plan param
(function checkPostAuthCheckout() {
    const params = new URLSearchParams(window.location.search);
    const plan = params.get('plan');
    if (!plan) return;

    const user = localStorage.getItem('cg_user');
    if (!user) return; // still not logged in

    // Clean the URL
    history.replaceState(null, '', window.location.pathname + window.location.hash);

    const parsed = JSON.parse(user);
    redirectToStripe(plan, parsed.email);
})();

// ─── CONTRACT TYPE CYCLING ANIMATION ────────────────────────
(function initContractTypeCycling() {
    const heroTitle = document.getElementById('heroMockupTitle');
    const scanCats = document.getElementById('mockScanCats');
    const tabFreelance = document.getElementById('mockTabFreelance');
    const tabEmployee = document.getElementById('mockTabEmployee');
    const tabNda = document.getElementById('mockTabNda');

    if (!scanCats || !tabFreelance) return;

    const types = [
        {
            tab: tabFreelance,
            filename: 'Service_Agreement_2026.pdf',
            cats: [
                { name: 'Scope Creep', color: '#ef4444' },
                { name: 'Cashflow Risk', color: '#f97316' },
                { name: 'IP Ownership', color: '#fbbf24' },
                { name: 'Non-Compete', color: '#ef4444' },
                { name: 'Termination', color: '#f97316' },
                { name: 'Liability Trap', color: '#fbbf24' },
                { name: 'Auto-Renewal', color: null },
                { name: 'Exclusivity', color: null }
            ]
        },
        {
            tab: tabEmployee,
            filename: 'Employment_Offer_Letter.pdf',
            cats: [
                { name: 'Compensation', color: '#fbbf24' },
                { name: 'Benefits & Equity', color: '#f97316' },
                { name: 'Non-Compete', color: '#ef4444' },
                { name: 'IP & Inventions', color: '#ef4444' },
                { name: 'Termination', color: '#f97316' },
                { name: 'Restrictive Covenants', color: '#fbbf24' },
                { name: 'Arbitration', color: null },
                { name: 'Confidentiality', color: null }
            ]
        },
        {
            tab: tabNda,
            filename: 'Mutual_NDA_2026.pdf',
            cats: [
                { name: 'Scope Breadth', color: '#ef4444' },
                { name: 'Duration', color: '#f97316' },
                { name: 'Obligations', color: '#fbbf24' },
                { name: 'Missing Carve-outs', color: '#ef4444' },
                { name: 'Remedies', color: '#f97316' },
                { name: 'Residuals', color: '#fbbf24' },
                { name: 'Return & Destruction', color: null },
                { name: 'Non-Solicitation', color: null }
            ]
        }
    ];

    let currentIndex = 0;

    function renderType(index) {
        const type = types[index];

        // Update tabs
        [tabFreelance, tabEmployee, tabNda].forEach(t => t.classList.remove('active'));
        type.tab.classList.add('active');

        // Update hero mockup filename
        if (heroTitle) heroTitle.textContent = type.filename;

        // Fade out categories, swap, fade in
        scanCats.style.opacity = '0';
        setTimeout(() => {
            scanCats.innerHTML = type.cats.map(c =>
                `<div class="mock-cat${c.color ? '' : ' mock-cat-muted'}"><span class="mock-cat-dot" style="background:${c.color || '#666'}"></span>${c.name}</div>`
            ).join('');
            scanCats.style.opacity = '1';
        }, 250);
    }

    // Initial state
    scanCats.style.transition = 'opacity 0.25s ease';
    tabFreelance.classList.add('active');

    // Cycle every 3.5 seconds
    setInterval(() => {
        currentIndex = (currentIndex + 1) % types.length;
        renderType(currentIndex);
    }, 3500);
})();
