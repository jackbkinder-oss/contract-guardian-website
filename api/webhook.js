const Stripe = require('stripe');

const stripe = new Stripe(process.env.TEST_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY);
const WEBHOOK_SECRET = process.env.TEST_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

const SUPABASE_URL = 'https://xdhmexgxhjalxieiwzcj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function supabaseFetch(method, path, body) {
    const opts = {
        method,
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

async function getUserByEmail(email) {
    const data = await supabaseFetch('GET', `users?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id`);
    return data && data.length > 0 ? data[0] : null;
}

// Map Stripe plan metadata to our plan names
const PAYG_CREDITS_PER_UNIT = 1;

const handler = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        const rawBody = await getRawBody(req);
        event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: 'Invalid signature' });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object);
                break;
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (err) {
        console.error(`Error handling ${event.type}:`, err.message);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
};

async function handleCheckoutCompleted(session) {
    const email = session.customer_email || session.customer_details?.email;
    if (!email) {
        console.error('No email found on checkout session');
        return;
    }

    const user = await getUserByEmail(email);
    if (!user) {
        console.error(`No user found for email: ${email}`);
        return;
    }

    const plan = session.metadata?.plan || 'unknown';

    if (plan === 'payg') {
        // One-time payment — add credits
        const quantity = session.metadata?.quantity ? parseInt(session.metadata.quantity) : 1;
        const credits = quantity * PAYG_CREDITS_PER_UNIT;

        // Check for existing subscription row
        const existing = await supabaseFetch('GET', `subscriptions?user_id=eq.${user.id}&plan=eq.payg&select=id,payg_credits`);

        if (existing && existing.length > 0) {
            // Add credits to existing row
            const newCredits = (existing[0].payg_credits || 0) + credits;
            await supabaseFetch('PATCH', `subscriptions?id=eq.${existing[0].id}`, {
                payg_credits: newCredits,
                status: 'active',
                updated_at: new Date().toISOString()
            });
        } else {
            await supabaseFetch('POST', 'subscriptions', {
                user_id: user.id,
                stripe_customer_id: session.customer || null,
                plan: 'payg',
                status: 'active',
                payg_credits: credits,
                updated_at: new Date().toISOString()
            });
        }
        console.log(`Added ${credits} PAYG credits for user ${user.id}`);
    } else if (plan === 'pro_monthly' || plan === 'pro_annual') {
        // Subscription — create/update row
        const existing = await supabaseFetch('GET', `subscriptions?user_id=eq.${user.id}&plan=in.(pro_monthly,pro_annual)&select=id`);

        const subData = {
            user_id: user.id,
            stripe_customer_id: session.customer || null,
            stripe_subscription_id: session.subscription || null,
            plan: plan,
            status: 'active',
            current_period_end: null, // Will be set by subscription.updated event
            updated_at: new Date().toISOString()
        };

        if (existing && existing.length > 0) {
            await supabaseFetch('PATCH', `subscriptions?id=eq.${existing[0].id}`, subData);
        } else {
            await supabaseFetch('POST', 'subscriptions', subData);
        }
        console.log(`Created/updated Pro subscription for user ${user.id} (${plan})`);
    }
}

async function handleSubscriptionUpdated(subscription) {
    const stripeSubId = subscription.id;
    const existing = await supabaseFetch('GET', `subscriptions?stripe_subscription_id=eq.${encodeURIComponent(stripeSubId)}&select=id`);

    if (!existing || existing.length === 0) {
        console.log(`No subscription found for Stripe sub ${stripeSubId}`);
        return;
    }

    const status = subscription.cancel_at_period_end ? 'canceling' :
                   subscription.status === 'active' ? 'active' :
                   subscription.status;

    await supabaseFetch('PATCH', `subscriptions?id=eq.${existing[0].id}`, {
        status: status,
        current_period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
        updated_at: new Date().toISOString()
    });
    console.log(`Updated subscription ${stripeSubId} to status: ${status}`);
}

async function handleSubscriptionDeleted(subscription) {
    const stripeSubId = subscription.id;
    const existing = await supabaseFetch('GET', `subscriptions?stripe_subscription_id=eq.${encodeURIComponent(stripeSubId)}&select=id`);

    if (!existing || existing.length === 0) return;

    await supabaseFetch('PATCH', `subscriptions?id=eq.${existing[0].id}`, {
        status: 'canceled',
        updated_at: new Date().toISOString()
    });
    console.log(`Canceled subscription ${stripeSubId}`);
}

async function handlePaymentFailed(invoice) {
    const stripeSubId = invoice.subscription;
    if (!stripeSubId) return;

    const existing = await supabaseFetch('GET', `subscriptions?stripe_subscription_id=eq.${encodeURIComponent(stripeSubId)}&select=id`);

    if (!existing || existing.length === 0) return;

    await supabaseFetch('PATCH', `subscriptions?id=eq.${existing[0].id}`, {
        status: 'past_due',
        updated_at: new Date().toISOString()
    });
    console.log(`Marked subscription ${stripeSubId} as past_due`);
}

// Vercel: disable body parsing so we get raw buffer for Stripe signature verification
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
