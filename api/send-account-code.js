const SUPABASE_URL = 'https://xdhmexgxhjalxieiwzcj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

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

    const { email, action } = req.body || {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email.' });
    }
    if (!action || !['change_password', 'delete_account'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action.' });
    }

    try {
        // Verify the account exists
        const userRes = await supabaseRequest(`users?email=eq.${encodeURIComponent(email)}&select=id`);
        const users = await userRes.json();
        if (!users || users.length === 0) {
            return res.status(404).json({ error: 'Account not found.' });
        }

        // Rate limit: 1 code per 60 seconds
        const oneMinAgo = new Date(Date.now() - 60000).toISOString();
        const recentRes = await supabaseRequest(
            `verification_codes?email=eq.${encodeURIComponent(email)}&created_at=gte.${oneMinAgo}&select=id`
        );
        const recent = await recentRes.json();
        if (recent && recent.length > 0) {
            return res.status(429).json({ error: 'Please wait before requesting another code.' });
        }

        // Delete existing codes for this email
        await supabaseRequest(`verification_codes?email=eq.${encodeURIComponent(email)}`, {
            method: 'DELETE'
        });

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        // Store code
        const insertRes = await supabaseRequest('verification_codes', {
            method: 'POST',
            body: JSON.stringify({ email, code, expires_at: expiresAt })
        });
        if (!insertRes.ok) {
            return res.status(500).json({ error: 'Failed to generate code.' });
        }

        const actionLabel = action === 'change_password' ? 'password change' : 'account deletion';

        // Send email
        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Contract Aegis <noreply@contractaegis.com>',
                to: [email],
                subject: `Your Contract Aegis ${actionLabel} code`,
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                        <div style="text-align: center; margin-bottom: 32px;">
                            <h1 style="color: #1a1a2e; font-size: 24px; margin: 0;">Contract Aegis</h1>
                        </div>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Your verification code for ${actionLabel} is:</p>
                        <div style="background: #f0f4ff; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                            <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #6366f1;">${code}</span>
                        </div>
                        <p style="color: #666; font-size: 14px; line-height: 1.5;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
                    </div>
                `
            })
        });

        if (!emailRes.ok) {
            console.error('Resend error:', await emailRes.text());
            return res.status(500).json({ error: 'Failed to send verification email.' });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('send-account-code error:', err.message);
        return res.status(500).json({ error: 'Something went wrong.' });
    }
};
