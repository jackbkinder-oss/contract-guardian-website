const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map plan names to Stripe Price IDs
const PLAN_CONFIG = {
    pro_monthly: {
        mode: 'subscription',
        priceId: 'price_1T6JEV1pwLqhPIA1un6t38VM'
    },
    pro_annual: {
        mode: 'subscription',
        priceId: 'price_1T6JEZ1pwLqhPIA1NrYsyFcJ'
    },
    payg: {
        mode: 'payment',
        priceId: 'price_1T6JEa1pwLqhPIA1eLrSPZo3'
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
            cancel_url: `${baseUrl}/cancel.html`
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
