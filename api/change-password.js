const SUPABASE_URL = 'https://xdhmexgxhjalxieiwzcj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const crypto = require('crypto');

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

    const { email, code, new_password } = req.body || {};

    if (!email || !code || !new_password) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (new_password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
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

        // Hash new password
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(new_password, salt, 64).toString('hex');
        const password_hash = `${salt}:${hash}`;

        // Update password in users table
        const updateRes = await supabaseRequest(`users?email=eq.${encodeURIComponent(email)}`, {
            method: 'PATCH',
            body: JSON.stringify({ password_hash })
        });

        if (!updateRes.ok) {
            return res.status(500).json({ error: 'Failed to update password.' });
        }

        // Delete used codes
        await supabaseRequest(`verification_codes?email=eq.${encodeURIComponent(email)}`, {
            method: 'DELETE'
        });

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('change-password error:', err.message);
        return res.status(500).json({ error: 'Something went wrong.' });
    }
};
