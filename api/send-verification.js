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

    const { email } = req.body || {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    try {
        // Check if email already exists in users table
        const existingRes = await supabaseRequest(`users?email=eq.${encodeURIComponent(email)}&select=id`);
        const existing = await existingRes.json();
        if (existing && existing.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        // Rate limit: check if a code was sent in the last 60 seconds
        const oneMinAgo = new Date(Date.now() - 60000).toISOString();
        const recentRes = await supabaseRequest(
            `verification_codes?email=eq.${encodeURIComponent(email)}&created_at=gte.${oneMinAgo}&select=id`
        );
        const recent = await recentRes.json();
        if (recent && recent.length > 0) {
            return res.status(429).json({ error: 'Please wait before requesting another code.' });
        }

        // Delete any existing codes for this email
        await supabaseRequest(`verification_codes?email=eq.${encodeURIComponent(email)}`, {
            method: 'DELETE'
        });

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

        // Store in verification_codes table
        const insertRes = await supabaseRequest('verification_codes', {
            method: 'POST',
            body: JSON.stringify({ email, code, expires_at: expiresAt })
        });
        if (!insertRes.ok) {
            console.error('Failed to store verification code:', await insertRes.text());
            return res.status(500).json({ error: 'Failed to send verification code.' });
        }

        // Send email via Resend
        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Contract Aegis <onboarding@resend.dev>',
                to: [email],
                subject: 'Your Contract Aegis verification code',
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                        <div style="text-align: center; margin-bottom: 32px;">
                            <h1 style="color: #1a1a2e; font-size: 24px; margin: 0;">Contract Aegis</h1>
                        </div>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Your verification code is:</p>
                        <div style="background: #f0f4ff; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                            <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #6366f1;">${code}</span>
                        </div>
                        <p style="color: #666; font-size: 14px; line-height: 1.5;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
                    </div>
                `
            })
        });

        if (!emailRes.ok) {
            const errText = await emailRes.text();
            console.error('Resend error:', errText);
            return res.status(500).json({ error: 'Failed to send verification email.', detail: errText });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('send-verification error:', err.message);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
};
