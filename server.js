import express from 'express';
import fetch from 'node-fetch';
import crypto from 'crypto';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';
const APP_URL = process.env.APP_URL || 'https://hfd-shipping.onrender.com';

const tokenStore = {};
const DEFAULT_HFD_TOKEN = process.env.HFD_TOKEN || '';
const DEFAULT_HFD_CLIENT_ID = process.env.HFD_CLIENT_ID || '';
if (process.env.SHOPIFY_TOKEN) {
  tokenStore['xn-vldscdfsea5ah3ae6j.myshopify.com'] = process.env.SHOPIFY_TOKEN;
}
console.log('Token loaded:', !!process.env.SHOPIFY_TOKEN);
const settingsStore = {};

// ===== CSP Headers =====
app.use((req, res, next) => {
  const shop = req.query.shop || '';
  res.setHeader("Content-Security-Policy", `frame-ancestors https://${shop} https://admin.shopify.com https://accounts.shopify.com *`);
  next();
});

// ===== OAuth =====
app.get('/auth', (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop');
  const scopes = 'read_orders,read_customers';
  const redirectUri = `${APP_URL}/auth/callback`;
  res.redirect(`https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${redirectUri}&state=xyz`);
});

app.get('/auth/callback', async (req, res) => {
  const { shop, code } = req.query;
  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: SHOPIFY_API_KEY, client_secret: SHOPIFY_API_SECRET, code }),
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { return res.status(500).send('Parse error: ' + text.substring(0, 200)); }
    if (data.access_token) {
      tokenStore[shop] = data.access_token;
      console.log('SHOPIFY_TOKEN:', shop, data.access_token);
      res.redirect(`/?shop=${shop}`);
    } else {
      res.status(500).send('No token: ' + JSON.stringify(data));
    }
  } catch (err) {
    res.status(500).send('Auth failed: ' + err.message);
  }
});

// ===== דף הגדרות ראשי =====
app.get('/', (req, res) => {
  const shop = req.query.shop || '';
  const settings = settingsStore[shop] || {};
  
  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>HFD Shipping - הגדרות</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;background:#f8f9fa;}
    h1{color:#2c6fad;text-align:center;}
    .card{background:white;padding:25px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.1);margin-bottom:20px;}
    input{width:100%;padding:9px;margin:4px 0 14px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;}
    label{font-weight:bold;font-size:14px;}
    .btn{background:#2c6fad;color:white;padding:10px 24px;border:none;border-radius:6px;cursor:pointer;font-size:15px;}
    .info{background:#e8f4fd;padding:15px;border-radius:8px;font-size:14px;color:#333;}
  </style>
</head>
<body>
  <h1>📦 HFD Shipping</h1>
  <div class="card">
    <h2>הגדרות</h2>
    <form method="POST" action="/save-settings">
      <input type="hidden" name="shop" value="${shop}">
      <label>טוקן HFD:</label>
      <input type="text" name="hfd_token" value="${settings.hfd_token || ''}" placeholder="הכנס את הטוקן שלך מ-HFD" required>
      <label>מספר לקוח HFD:</label>
      <input type="text" name="client_id" value="${settings.client_id || ''}" placeholder="לדוגמה: 9841" required>
      <button type="submit" class="btn">שמור הגדרות</button>
    </form>
  </div>
  <div class="info">
    <strong>איך להשתמש?</strong><br>
    לאחר שמירת ההגדרות, כנס להזמנה בשופיפיי, לחץ על "More actions" ואז "Send to HFD" כדי לפתוח משלוח.
  </div>
</body>
</html>`);
});

// ===== שמירת הגדרות =====
app.post('/save-settings', (req, res) => {
  const { shop, hfd_token, client_id } = req.body;
  settingsStore[shop] = { hfd_token, client_id };
  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><style>body{font-family:Arial;max-width:600px;margin:80px auto;text-align:center;}.success{color:green;font-size:20px;}a{color:#2c6fad;}</style></head>
<body><div class="success">✅ ההגדרות נשמרו!</div><br><a href="/?shop=${shop}">חזרה</a></body>
</html>`);
});

// ===== דף שליחה ל-HFD (נפתח מתוך הזמנה) =====
app.get('/send_to_hfd', async (req, res) => {
  const { id, shop } = req.query;
  const settings = settingsStore[shop] || { hfd_token: DEFAULT_HFD_TOKEN, client_id: DEFAULT_HFD_CLIENT_ID };
  const accessToken = tokenStore[shop];

  let order = null;
  let errorMsg = '';

  if (accessToken && id) {
    try {
      const r = await fetch(`https://${shop}/admin/api/2024-01/orders/${id}.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });
      const data = await r.json();
      order = data.order;
      console.log('Order fetch result:', JSON.stringify(data).substring(0, 200));
    } catch(e) {
      errorMsg = e.message;
    }
  }

  const addr = order?.shipping_address || {};
  const name = addr.name || order?.email || '';
  const phone = addr.phone || order?.phone || '';
  const email = order?.email || '';
  const address1 = addr.address1 || '';
  const address2 = addr.address2 || '';
  const city = addr.city || '';
  const orderNumber = order?.order_number || id;

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>שליחה ל-HFD</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:700px;margin:30px auto;padding:20px;background:#f8f9fa;}
    h1{color:#2c6fad;}
    .card{background:white;padding:25px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.1);margin-bottom:15px;}
    .order-info{background:#e8f4fd;padding:15px;border-radius:8px;margin-bottom:20px;}
    .order-info p{margin:5px 0;}
    input,select,textarea{width:100%;padding:9px;margin:4px 0 14px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;}
    label{font-weight:bold;font-size:14px;}
    .btn{background:#2c6fad;color:white;padding:12px 30px;border:none;border-radius:6px;cursor:pointer;font-size:16px;width:100%;}
    .btn:hover{background:#1a5490;}
    .radio-group{display:flex;gap:20px;margin-bottom:15px;}
    .radio-option{flex:1;border:2px solid #ddd;border-radius:8px;padding:15px;cursor:pointer;text-align:center;}
    .radio-option.selected{border-color:#2c6fad;background:#e8f4fd;}
    h2{color:#333;margin-top:0;}
    .no-settings{color:red;text-align:center;}
  </style>
</head>
<body>
  <h1>📦 שליחה ל-HFD</h1>
  
  ${!settings.hfd_token ? `<p class="no-settings">⚠️ לא הוגדרו הגדרות. <a href="/?shop=${shop}">לחץ כאן להגדרות</a></p>` : ''}
  
  <div class="order-info">
    <strong>הזמנה #${orderNumber}</strong>
    <p>👤 ${name}</p>
    <p>📞 ${phone}</p>
    <p>📍 ${address1}${address2 ? ', ' + address2 : ''}, ${city}</p>
  </div>

  <form method="POST" action="/create-shipment">
    <input type="hidden" name="shop" value="${shop}">
    <input type="hidden" name="hfd_token" value="${settings.hfd_token || ''}">
    <input type="hidden" name="client_id" value="${settings.client_id || ''}">
    <input type="hidden" name="order_id" value="${id}">

    <div class="card">
      <h2>סוג משלוח</h2>
      <div class="radio-group">
        <label class="radio-option selected" id="opt-home">
          <input type="radio" name="shipment_type" value="home" checked onchange="toggleType('home')">
          🏠 עד הבית
        </label>
        <label class="radio-option" id="opt-pickup">
          <input type="radio" name="shipment_type" value="pickup" onchange="toggleType('pickup')">
          📦 נקודת חלוקה
        </label>
      </div>
    </div>

    <div class="card">
      <h2>פרטי נמען</h2>
      <label>שם:</label>
      <input type="text" name="receiver_name" value="${name}" required>
      <label>טלפון:</label>
      <input type="text" name="receiver_phone" value="${phone}" required>
      <label>אימייל:</label>
      <input type="text" name="receiver_email" value="${email}">

      <div id="home-fields">
        <label>כתובת:</label>
        <input type="text" name="receiver_address" value="${address1}">
        <label>עיר:</label>
        <input type="text" name="receiver_city" value="${city}">
        <label>מספר בניין:</label>
        <input type="text" name="receiver_building" value="${address2}">
        <label>דירה:</label>
        <input type="text" name="receiver_appartment">
      </div>

      <div id="pickup-fields" style="display:none">
        <label>מספר נקודת חלוקה:</label>
        <input type="text" name="pickup_point" placeholder="הכנס מספר נקודה">
      </div>

      <label>הערות למשלוח:</label>
      <input type="text" name="shipment_comments" placeholder="אופציונאלי">
    </div>

    <button type="submit" class="btn">✅ פתח משלוח HFD</button>
  </form>

  <script>
    function toggleType(type) {
      document.getElementById('home-fields').style.display = type === 'home' ? 'block' : 'none';
      document.getElementById('pickup-fields').style.display = type === 'pickup' ? 'block' : 'none';
      document.getElementById('opt-home').classList.toggle('selected', type === 'home');
      document.getElementById('opt-pickup').classList.toggle('selected', type === 'pickup');
    }
  </script>
</body>
</html>`);
});

// ===== יצירת משלוח =====
app.post('/create-shipment', async (req, res) => {
  const { shop, hfd_token, client_id, receiver_name, receiver_phone, receiver_email,
    receiver_address, receiver_city, receiver_building, receiver_appartment,
    shipment_comments, shipment_type, pickup_point } = req.body;

  const today = new Date();
  const execution_date = today.toISOString().slice(0,10).replace(/-/g,'');
  const execution_time = today.toTimeString().slice(0,8).replace(/:/g,'');
  const isPickup = shipment_type === 'pickup';

  const payload = {
    action_type: "סגירה",
    cargo_type_id_delivery: isPickup ? 11 : 10,
    client_id: parseInt(client_id),
    client_name: "",
    client_order_number: "",
    execution_date, execution_time,
    govina: [], hadpes: true, id_2: "", ovala: "חבילה",
    packages_qty_away: 1,
    receiver_appartment: receiver_appartment || "",
    receiver_building: receiver_building || "",
    receiver_city_id: 5000,
    receiver_comments: "", receiver_email: receiver_email || "",
    receiver_entrance: "", receiver_floor: "",
    receiver_name, receiver_phone,
    receiver_street_id: "404",
    return_to_shipments_page: false, save_add: false,
    sender_appartment: "", sender_building: "",
    sender_city_id: 5000, sender_comments: "", sender_email: "",
    sender_entrance: "", sender_floor: "",
    sender_name: "", sender_phone: "",
    sender_street_id: "404",
    shipment_comments: shipment_comments || "",
    shipment_type_id: isPickup ? 36 : 35,
    sub_payment: "",
  };

  try {
    const response = await fetch('https://ws2.hfd.co.il/rest/v2/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${hfd_token}`, 'Accept': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (response.ok) {
      res.send(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><style>body{font-family:Arial;max-width:600px;margin:80px auto;text-align:center;}.success{color:green;font-size:22px;}a{color:#2c6fad;}</style></head><body><div class="success">✅ המשלוח נפתח בהצלחה!</div><p>מספר משלוח: <strong>${data.id || data.parcel_id || JSON.stringify(data)}</strong></p><a href="javascript:window.close()">סגור חלון</a></body></html>`);
    } else {
      res.send(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><style>body{font-family:Arial;max-width:600px;margin:80px auto;text-align:center;}.error{color:red;}a{color:#2c6fad;}</style></head><body><div class="error">❌ שגיאה: ${JSON.stringify(data)}</div><a href="javascript:history.back()">חזרה</a></body></html>`);
    }
  } catch (err) {
    res.send(`<p style="color:red">שגיאה: ${err.message}</p>`);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
