const Stripe = require('stripe');

const stripe = new Stripe(process.env.TEST_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY);

// Map plan names to Stripe Price IDs
const PLAN_CONFIG = {
    pro_monthly: {
        mode: 'subscription',
        priceId: 'price_1T6Kla1pwLqhPIA1OW4tEIXf'
    },
    pro_annual: {
        mode: 'subscription',
        priceId: 'price_1T6Klr1pwLqhPIA18BxgNUQ3'
    },
    payg: {
        mode: 'payment',
        priceId: 'price_1T6Km41pwLqhPIA1VAQNCdGj'
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
        const baseUrl = process.env.SITE_URL || 'https://contractaegis.app';

        const sessionParams = {
            mode: config.mode,
            line_items: [{
                price: config.priceId,
                quantity: plan === 'payg' ? (quantity || 1) : 1
            }],
            success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
            cancel_url: `${baseUrl}/cancel.html`,
            metadata: { plan, quantity: String(plan === 'payg' ? (quantity || 1) : 1) }
        };

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
