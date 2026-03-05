const SUPABASE_URL = 'https://xdhmexgxhjalxieiwzcj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseRequest(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json'
        }
    });
    const text = await res.text();
    return text ? JSON.parse(text) : null;
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
        // Get free analyses used from users table
        const users = await supabaseRequest(`users?id=eq.${user_id}&select=free_analyses_used`);
        const freeUsed = (users && users[0]) ? (users[0].free_analyses_used || 0) : 0;

        // Get PAYG credits from subscriptions table
        const subs = await supabaseRequest(
            `subscriptions?user_id=eq.${user_id}&plan=eq.payg&status=eq.active&select=payg_credits&order=updated_at.desc&limit=1`
        );
        const paygCredits = (subs && subs[0]) ? (subs[0].payg_credits || 0) : 0;

        // Determine tier and whether user can analyze
        let tier, canAnalyze;
        if (paygCredits > 0) {
            tier = 'payg';
            canAnalyze = true;
        } else if (freeUsed < 1) {
            tier = 'free';
            canAnalyze = true;
        } else {
            tier = 'free';
            canAnalyze = false;
        }

        return res.status(200).json({
            tier,
            freeAnalysesUsed: freeUsed,
            paygCredits,
            canAnalyze
        });
    } catch (err) {
        console.error('check-credits error:', err.message);
        return res.status(500).json({ error: 'Failed to check credits.' });
    }
};
