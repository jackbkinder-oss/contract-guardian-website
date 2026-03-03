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

    const { plan, quantity, email } = req.body;

    const config = PLAN_CONFIG[plan];
    if (!config) {
        return res.status(400).json({ error: 'Invalid plan. Must be: pro_monthly, pro_annual, or payg' });
    }

    try {
        // Create a Paddle transaction server-side to get a checkout URL
        const baseUrl = process.env.SITE_URL || 'https://www.contractaegis.com';

        const transactionBody = {
            items: [{
                price_id: config.priceId,
                quantity: plan === 'payg' ? (quantity || 1) : 1
            }],
            custom_data: {
                plan,
                email: email || '',
                quantity: String(plan === 'payg' ? (quantity || 1) : 1)
            },
            checkout: {
                url: `${baseUrl}/success.html?plan=${plan}`
            }
        };

        // If email provided, look up or let Paddle create customer
        if (email) {
            transactionBody.customer = { email };
        }

        const response = await fetch(`${PADDLE_BASE}/transactions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PADDLE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transactionBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('Paddle transaction error:', errText);
            return res.status(500).json({ error: 'Failed to create checkout session' });
        }

        const data = await response.json();
        const transaction = data.data;

        // Build checkout URL from transaction ID
        const checkoutDomain = PADDLE_BASE.includes('sandbox')
            ? 'https://sandbox-checkout.paddle.com'
            : 'https://checkout.paddle.com';
        const checkoutUrl = `${checkoutDomain}/transaction/${transaction.id}`;

        res.json({ url: checkoutUrl });
    } catch (err) {
        console.error('Paddle checkout error:', err.message);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
};
