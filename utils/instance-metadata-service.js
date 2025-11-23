const TOKEN_URL = 'http://169.254.169.254/latest/api/token';
const METADATA_BASE = 'http://169.254.169.254/latest/meta-data';

async function getImdsToken(signal) {
    const res = await fetch(TOKEN_URL, {
        method: 'PUT',
        headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
        signal
    });
    if (!res.ok) throw new Error(`IMDS token error: ${res.status}`);
    return res.text();
}

async function getMeta(path, token, signal) {
    const res = await fetch(`${METADATA_BASE}/${path}`, {
        headers: { 'X-aws-ec2-metadata-token': token },
        signal
    });
    if (!res.ok) throw new Error(`IMDS ${path} error: ${res.status}`);
    return res.text();
}

let cache;
let cacheUntil = 0;

async function fetchInstanceIdentity({ timeoutMs = 1000 } = {}) {
    const now = Date.now();
    if (cache && now < cacheUntil) return cache;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort('IMDS timeout'), timeoutMs);

    try {
        const token = await getImdsToken(ac.signal);
        const [instanceId, az, privateIp] = await Promise.all([
            getMeta('instance-id', token, ac.signal),
            getMeta('placement/availability-zone', token, ac.signal),
            getMeta('local-ipv4', token, ac.signal)
        ]);

        const region = az.replace(/[a-z]$/, '');

        cache = { instanceId, az, region, privateIp, source: 'imds-v2', fetchedAt: new Date().toISOString() };
        cacheUntil = now + 10 * 60 * 1000;
        return cache;
    } catch (err) {
        const fallback = {
            instanceId: process.env.INSTANCE_ID || 'unknown',
            az: process.env.AVAILABILITY_ZONE || 'unknown',
            region: process.env.AWS_REGION || process.env.AMAZON_REGION || 'unknown',
            privateIp: process.env.PRIVATE_IP || 'unknown',
            source: 'env-fallback',
            error: String(err),
            fetchedAt: new Date().toISOString()
        };
        cache = fallback;
        cacheUntil = now + 60 * 1000;
        return fallback;
    } finally {
        clearTimeout(t);
    }
}

module.exports = { fetchInstanceIdentity };
