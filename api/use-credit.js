const SUPABASE_URL = 'https://xdhmexgxhjalxieiwzcj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseRequest(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': options.prefer || 'return=representation',
            ...options.headers
        }
    });
    const text = await res.text();
    return { ok: res.ok, data: text ? JSON.parse(text) : null };
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

    try {
        // Check PAYG credits first
        const subsRes = await supabaseRequest(
            `subscriptions?user_id=eq.${user_id}&plan=eq.payg&status=eq.active&select=id,payg_credits&order=updated_at.desc&limit=1`
        );
        const paygSub = subsRes.data && subsRes.data[0];

        if (paygSub && paygSub.payg_credits > 0) {
            // Decrement PAYG credit
            const newCredits = paygSub.payg_credits - 1;
            const updateBody = { payg_credits: newCredits, updated_at: new Date().toISOString() };
            // If credits hit 0, mark as canceled
            if (newCredits === 0) updateBody.status = 'canceled';

            await supabaseRequest(`subscriptions?id=eq.${paygSub.id}`, {
                method: 'PATCH',
                body: JSON.stringify(updateBody)
            });

            return res.status(200).json({
                success: true,
                tier: newCredits > 0 ? 'payg' : 'free',
                creditUsed: 'payg',
                paygCredits: newCredits
            });
        }

        // No PAYG credits — check free tier
        const usersRes = await supabaseRequest(`users?id=eq.${user_id}&select=free_analyses_used`);
        const user = usersRes.data && usersRes.data[0];
        const freeUsed = user ? (user.free_analyses_used || 0) : 0;

        if (freeUsed < 1) {
            // Increment free analyses used
            await supabaseRequest(`users?id=eq.${user_id}`, {
                method: 'PATCH',
                body: JSON.stringify({ free_analyses_used: freeUsed + 1 })
            });

            return res.status(200).json({
                success: true,
                tier: 'free',
                creditUsed: 'free',
                freeAnalysesUsed: freeUsed + 1
            });
        }

        // No credits available
        return res.status(403).json({ error: 'No credits available.' });
    } catch (err) {
        console.error('use-credit error:', err.message);
        return res.status(500).json({ error: 'Failed to use credit.' });
    }
};
