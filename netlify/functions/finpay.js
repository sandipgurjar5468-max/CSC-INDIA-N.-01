const BASE_URL = 'https://login.finpayultra.com';

// Operator IDs shared earlier from the user's FinPay Ultra dashboard/screenshots.
// Primary recharge options used by the website:
const OPERATOR_IDS = Object.freeze({
  AIRTEL: 1,
  BSNL: 3, // BSNL Topup
  JIO: 5,
  VI: 6
});

// Additional operator/service IDs retained for future service-specific routing.
const ADDITIONAL_OPERATOR_IDS = Object.freeze({
  BSNL_SPECIAL: 4,
  AIRTEL_MIX_P2A: 183,
  AIRTEL_LIVE: 193,
  VI_P2A: 194,
  JIO_P2A: 209,
  JIO_LIVE: 210,
  BSNL_LIVE: 213,
  VI_LIVE: 214
});

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': process.env.SITE_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });

  const token = process.env.FINPAY_API_TOKEN;
  if (!token) return reply(503, { error: 'Netlify में FINPAY_API_TOKEN environment variable सेट नहीं है।' });

  let data;
  try { data = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { error: 'Invalid request body' }); }

  if (data.action !== 'recharge') return reply(400, { error: 'Unsupported action' });

  const mobile = String(data.mobile || '').trim();
  const amount = Number(data.amount);
  const operator = String(data.operator || '').trim().toUpperCase();
  if (!/^[6-9]\d{9}$/.test(mobile) || !Number.isFinite(amount) || amount < 10 || amount > 50000) {
    return reply(400, { error: 'मोबाइल नंबर या amount सही नहीं है।' });
  }

  const optId = OPERATOR_IDS[operator];
  if (!optId) return reply(400, { error: 'चुना गया operator उपलब्ध नहीं है।' });

  const refTxnId = `BALAJI${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  // FinPay API details from the user's previously supplied integration screen:
  // /api/Service/Recharge with ApiToken, MobileNo, Amount, OptId, RefTxnId
  const url = new URL('/api/Service/Recharge', BASE_URL);
  url.searchParams.set('ApiToken', token);
  url.searchParams.set('MobileNo', mobile);
  url.searchParams.set('Amount', String(amount));
  url.searchParams.set('OptId', String(optId));
  url.searchParams.set('RefTxnId', refTxnId);

  try {
    const response = await fetch(url.toString(), { method: 'GET', headers: { 'Accept': 'application/json' } });
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); } catch { result = { raw }; }
    if (!response.ok) {
      return reply(502, { error: 'FinPay server ने request स्वीकार नहीं की।', providerStatus: response.status, details: result, reference: refTxnId });
    }
    return reply(200, {
      message: 'Recharge request FinPay को भेज दी गई है। अंतिम सफलता status check से ही confirm होगी।',
      reference: refTxnId,
      operatorId: optId,
      providerResponse: result
    });
  } catch (error) {
    return reply(502, { error: 'FinPay server से संपर्क नहीं हो पाया।', reference: refTxnId });
  }
};
