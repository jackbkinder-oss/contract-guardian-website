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

    const { email, code, password_hash } = req.body || {};

    if (!email || !code || !password_hash) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        // Look up valid verification code
        const now = new Date().toISOString();
        const codeRes = await supabaseRequest(
            `verification_codes?email=eq.${encodeURIComponent(email)}&code=eq.${encodeURIComponent(code)}&expires_at=gte.${now}&select=id`
        );
        const codes = await codeRes.json();

        if (!codes || codes.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }

        // Create user in users table
        const insertRes = await supabaseRequest('users', {
            method: 'POST',
            body: JSON.stringify({
                first_name: '',
                last_name: '',
                email,
                password_hash
            })
        });

        if (!insertRes.ok) {
            const errText = await insertRes.text();
            // Duplicate email (unique constraint violation)
            if (errText.includes('23505') || errText.includes('duplicate')) {
                return res.status(409).json({ error: 'An account with this email already exists.' });
            }
            console.error('User insert error:', errText);
            return res.status(500).json({ error: 'Failed to create account.' });
        }

        const users = await insertRes.json();
        const user = users[0];

        // Clean up all verification codes for this email
        await supabaseRequest(`verification_codes?email=eq.${encodeURIComponent(email)}`, {
            method: 'DELETE'
        });

        return res.status(200).json({
            success: true,
            user: { id: user.id, email: user.email }
        });
    } catch (err) {
        console.error('verify-and-signup error:', err.message);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
};
