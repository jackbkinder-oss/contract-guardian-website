const SUPABASE_URL = 'https://xdhmexgxhjalxieiwzcj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { user_id, credits } = req.body;

    if (!user_id || typeof credits !== 'number' || credits < 0) {
        return res.status(400).json({ error: 'Missing user_id or invalid credits' });
    }

    try {
        // Find the PAYG subscription for this user
        const subs = await supabaseFetch('GET', `subscriptions?user_id=eq.${user_id}&plan=eq.payg&select=id,payg_credits`);

        if (!subs || subs.length === 0) {
            return res.status(404).json({ error: 'No PAYG subscription found' });
        }

        const sub = subs[0];

        if (credits === 0) {
            // Credits exhausted — mark as canceled
            await supabaseFetch('PATCH', `subscriptions?id=eq.${sub.id}`, {
                payg_credits: 0,
                status: 'canceled',
                updated_at: new Date().toISOString()
            });
            return res.json({ success: true, action: 'canceled', payg_credits: 0 });
        }

        // Update remaining credits
        await supabaseFetch('PATCH', `subscriptions?id=eq.${sub.id}`, {
            payg_credits: credits,
            updated_at: new Date().toISOString()
        });

        res.json({ success: true, payg_credits: credits });
    } catch (err) {
        console.error('Update PAYG credits error:', err.message);
        res.status(500).json({ error: 'Failed to update credits' });
    }
};
