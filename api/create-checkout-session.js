const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map plan names to Stripe Price lookup keys
// Set these in your Stripe Dashboard under Products → Prices → Lookup Key
const PLAN_CONFIG = {
    pro_monthly: {
        mode: 'subscription',
        lookup_key: 'pro_monthly'
    },
    pro_annual: {
        mode: 'subscription',
        lookup_key: 'pro_annual'
    },
    payg: {
        mode: 'payment',
        lookup_key: 'payg_single'
    }
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { plan, quantity, email } = req.body;

    const config = PLAN_CONFIG[plan];
    if (!config) {
        return res.status(400).json({ error: 'Invalid plan. Must be: pro_monthly, pro_annual, or payg' });
    }

    try {
        // Look up the price by lookup key
        const prices = await stripe.prices.list({
            lookup_keys: [config.lookup_key],
            expand: ['data.product']
        });

        if (!prices.data.length) {
            return res.status(400).json({ error: `No price found for lookup key: ${config.lookup_key}` });
        }

        const baseUrl = process.env.SITE_URL || 'https://contractaegis.app';

        const sessionParams = {
            mode: config.mode,
            line_items: [{
                price: prices.data[0].id,
                quantity: plan === 'payg' ? (quantity || 1) : 1
            }],
            success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
            cancel_url: `${baseUrl}/cancel.html`
        };

        // Pre-fill email if provided
        if (email) {
            sessionParams.customer_email = email;
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        res.json({ url: session.url });
    } catch (err) {
        console.error('Stripe checkout error:', err.message);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
};
