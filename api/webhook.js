const crypto = require('crypto');

const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_SANDBOX_WEBHOOK_SECRET || process.env.PADDLE_WEBHOOK_SECRET;
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

function verifyPaddleSignature(rawBody, signature, secret) {
    if (!secret || !signature) return false;
    // Paddle sends: ts=<timestamp>;h1=<hash>
    const parts = {};
    signature.split(';').forEach(p => {
        const [k, v] = p.split('=');
        parts[k] = v;
    });
    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) return false;
    const payload = `${ts}:${rawBody.toString('utf8')}`;
    const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(h1));
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

const PAYG_CREDITS_PER_UNIT = 1;

const handler = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const rawBody = await getRawBody(req);
    const signature = req.headers['paddle-signature'];

    // Verify webhook signature
    if (PADDLE_WEBHOOK_SECRET && signature) {
        if (!verifyPaddleSignature(rawBody, signature, PADDLE_WEBHOOK_SECRET)) {
            console.error('Paddle webhook signature verification failed');
            return res.status(400).json({ error: 'Invalid signature' });
        }
    }

    let event;
    try {
        event = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    const eventType = event.event_type;
    const data = event.data;

    try {
        switch (eventType) {
            case 'transaction.completed':
                await handleTransactionCompleted(data);
                break;
            case 'subscription.activated':
                await handleSubscriptionActivated(data);
                break;
            case 'subscription.updated':
                await handleSubscriptionUpdated(data);
                break;
            case 'subscription.canceled':
                await handleSubscriptionCanceled(data);
                break;
            case 'subscription.past_due':
                await handleSubscriptionPastDue(data);
                break;
            default:
                console.log(`Unhandled Paddle event: ${eventType}`);
        }

        res.json({ received: true });
    } catch (err) {
        console.error(`Error handling ${eventType}:`, err.message);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
};

async function handleTransactionCompleted(data) {
    const customData = data.custom_data || {};
    const plan = customData.plan;

    // Handle PAYG and Pro top-up one-time purchases
    if (plan !== 'payg' && plan !== 'pro_topup') return; // Subscriptions handled by subscription events

    const email = customData.email;
    if (!email) {
        console.error('No email in transaction custom_data');
        return;
    }

    const user = await getUserByEmail(email);
    if (!user) {
        console.error(`No user found for email: ${email}`);
        return;
    }

    const quantity = customData.quantity ? parseInt(customData.quantity) : 1;
    const credits = quantity * PAYG_CREDITS_PER_UNIT;

    // Pro top-up: add credits to the Pro subscription row (don't change plan)
    if (plan === 'pro_topup') {
        const proSub = await supabaseFetch('GET', `subscriptions?user_id=eq.${user.id}&plan=in.(pro_monthly,pro_annual)&status=in.(active,canceling)&select=id,payg_credits`);
        if (proSub && proSub.length > 0) {
            const newCredits = (proSub[0].payg_credits || 0) + credits;
            await supabaseFetch('PATCH', `subscriptions?id=eq.${proSub[0].id}`, {
                payg_credits: newCredits,
                updated_at: new Date().toISOString()
            });
            console.log(`Added ${credits} top-up credits to Pro user ${user.id}`);
        }
        return;
    }

    const existing = await supabaseFetch('GET', `subscriptions?user_id=eq.${user.id}&plan=eq.payg&select=id,payg_credits`);

    if (existing && existing.length > 0) {
        const newCredits = (existing[0].payg_credits || 0) + credits;
        await supabaseFetch('PATCH', `subscriptions?id=eq.${existing[0].id}`, {
            payg_credits: newCredits,
            status: 'active',
            updated_at: new Date().toISOString()
        });
    } else {
        await supabaseFetch('POST', 'subscriptions', {
            user_id: user.id,
            paddle_customer_id: data.customer_id || null,
            plan: 'payg',
            status: 'active',
            payg_credits: credits,
            updated_at: new Date().toISOString()
        });
    }
    console.log(`Added ${credits} PAYG credits for user ${user.id}`);
}

async function handleSubscriptionActivated(data) {
    const customData = data.custom_data || {};
    const email = customData.email;
    const plan = customData.plan || 'pro_monthly';

    if (!email) {
        console.error('No email in subscription custom_data');
        return;
    }

    const user = await getUserByEmail(email);
    if (!user) {
        console.error(`No user found for email: ${email}`);
        return;
    }

    const existing = await supabaseFetch('GET', `subscriptions?user_id=eq.${user.id}&plan=in.(pro_monthly,pro_annual)&select=id`);

    const periodEnd = data.current_billing_period?.ends_at || null;

    const subData = {
        user_id: user.id,
        paddle_customer_id: data.customer_id || null,
        paddle_subscription_id: data.id || null,
        plan: plan,
        status: 'active',
        current_period_end: periodEnd,
        updated_at: new Date().toISOString()
    };

    if (existing && existing.length > 0) {
        await supabaseFetch('PATCH', `subscriptions?id=eq.${existing[0].id}`, subData);
    } else {
        await supabaseFetch('POST', 'subscriptions', subData);
    }
    console.log(`Activated Pro subscription for user ${user.id} (${plan})`);
}

async function handleSubscriptionUpdated(data) {
    const paddleSubId = data.id;
    const existing = await supabaseFetch('GET', `subscriptions?paddle_subscription_id=eq.${encodeURIComponent(paddleSubId)}&select=id`);

    if (!existing || existing.length === 0) {
        console.log(`No subscription found for Paddle sub ${paddleSubId}`);
        return;
    }

    const scheduledChange = data.scheduled_change;
    const isCanceling = scheduledChange && scheduledChange.action === 'cancel';
    const periodEnd = data.current_billing_period?.ends_at || null;

    const status = isCanceling ? 'canceling' :
                   data.status === 'active' ? 'active' :
                   data.status;

    await supabaseFetch('PATCH', `subscriptions?id=eq.${existing[0].id}`, {
        status: status,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString()
    });
    console.log(`Updated Paddle subscription ${paddleSubId} to status: ${status}`);
}

async function handleSubscriptionCanceled(data) {
    const paddleSubId = data.id;
    const existing = await supabaseFetch('GET', `subscriptions?paddle_subscription_id=eq.${encodeURIComponent(paddleSubId)}&select=id`);

    if (!existing || existing.length === 0) return;

    await supabaseFetch('PATCH', `subscriptions?id=eq.${existing[0].id}`, {
        status: 'canceled',
        updated_at: new Date().toISOString()
    });
    console.log(`Canceled Paddle subscription ${paddleSubId}`);
}

async function handleSubscriptionPastDue(data) {
    const paddleSubId = data.id;
    const existing = await supabaseFetch('GET', `subscriptions?paddle_subscription_id=eq.${encodeURIComponent(paddleSubId)}&select=id`);

    if (!existing || existing.length === 0) return;

    await supabaseFetch('PATCH', `subscriptions?id=eq.${existing[0].id}`, {
        status: 'past_due',
        updated_at: new Date().toISOString()
    });
    console.log(`Marked Paddle subscription ${paddleSubId} as past_due`);
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
