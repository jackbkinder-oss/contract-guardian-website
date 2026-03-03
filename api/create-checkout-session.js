const PADDLE_API_KEY = process.env.PADDLE_SANDBOX_API_KEY || process.env.PADDLE_API_KEY;
const PADDLE_BASE = process.env.PADDLE_ENV === 'live'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';

// Map plan names to Paddle Price IDs
const PLAN_CONFIG = {
    pro_monthly: { priceId: 'pri_01kjs2rmwbvhqke26qdyhrswky' },
    pro_annual:  { priceId: 'pri_01kjs2t11rwydq53gtm4ct2fz6' },
    payg:        { priceId: 'pri_01kjs2wg87a1708vvmhrw65q17' }
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { plan, quantity, email, user_id } = req.body;

    const config = PLAN_CONFIG[plan];
    if (!config) {
        return res.status(400).json({ error: 'Invalid plan. Must be: pro_monthly, pro_annual, or payg' });
    }

    // For Paddle overlay checkout, the client handles the UI.
    // This endpoint returns the price ID and transaction config for Paddle.js
    // If needed, we can create a transaction server-side instead.
    res.json({
        priceId: config.priceId,
        plan,
        quantity: plan === 'payg' ? (quantity || 1) : 1
    });
};
