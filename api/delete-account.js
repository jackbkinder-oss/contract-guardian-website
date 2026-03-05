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
    return res;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, code } = req.body || {};

    if (!email || !code) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        // Verify code
        const codeRes = await supabaseRequest(
            `verification_codes?email=eq.${encodeURIComponent(email)}&code=eq.${code}&select=id,expires_at`
        );
        const codes = await codeRes.json();

        if (!codes || codes.length === 0) {
            return res.status(400).json({ error: 'Invalid verification code.' });
        }

        if (new Date(codes[0].expires_at) < new Date()) {
            return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
        }

        // Get user ID
        const userRes = await supabaseRequest(`users?email=eq.${encodeURIComponent(email)}&select=id`);
        const users = await userRes.json();
        if (!users || users.length === 0) {
            return res.status(404).json({ error: 'Account not found.' });
        }
        const userId = users[0].id;

        // Delete subscriptions for this user
        await supabaseRequest(`subscriptions?user_id=eq.${userId}`, {
            method: 'DELETE'
        });

        // Delete verification codes
        await supabaseRequest(`verification_codes?email=eq.${encodeURIComponent(email)}`, {
            method: 'DELETE'
        });

        // Delete user
        const deleteRes = await supabaseRequest(`users?id=eq.${userId}`, {
            method: 'DELETE'
        });

        if (!deleteRes.ok) {
            return res.status(500).json({ error: 'Failed to delete account.' });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('delete-account error:', err.message);
        return res.status(500).json({ error: 'Something went wrong.' });
    }
};
