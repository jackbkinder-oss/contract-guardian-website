const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_BASE = 'https://api.paddle.com';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { paddle_subscription_id } = req.body;

    if (!paddle_subscription_id) {
        return res.status(400).json({ error: 'Missing paddle_subscription_id' });
    }

    try {
        // Cancel at end of billing period
        const response = await fetch(`${PADDLE_BASE}/subscriptions/${paddle_subscription_id}/cancel`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PADDLE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                effective_from: 'next_billing_period'
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('Paddle cancel error:', err);
            return res.status(500).json({ error: 'Failed to cancel subscription' });
        }

        const data = await response.json();
        const sub = data.data;

        res.json({
            success: true,
            status: sub.status,
            scheduled_change: sub.scheduled_change,
            current_period_end: sub.current_billing_period?.ends_at || null
        });
    } catch (err) {
        console.error('Paddle cancel error:', err.message);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
};
