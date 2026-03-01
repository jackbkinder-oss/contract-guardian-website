/* ============================================================
   TOS Guardian — Website Script
   ============================================================ */

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

// ─── STRIPE CHECKOUT ────────────────────────────────────────
function startCheckout(plan) {
    const user = localStorage.getItem('cg_user');
    if (!user) {
        // Not logged in — send to signup with plan param so they return to checkout after
        window.location.href = `signup.html?plan=${plan}`;
        return;
    }

    const parsed = JSON.parse(user);
    // Determine the Stripe plan key (pro respects billing toggle)
    let stripePlan = plan;
    if (plan === 'pro') {
        const toggle = document.getElementById('websiteBillingToggle');
        stripePlan = (toggle && toggle.checked) ? 'pro_annual' : 'pro_monthly';
    }

    redirectToStripe(stripePlan, parsed.email);
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
    let stripePlan = plan;
    if (plan === 'pro') {
        stripePlan = 'pro_monthly'; // default to monthly for redirects
    }

    redirectToStripe(stripePlan, parsed.email);
})();
