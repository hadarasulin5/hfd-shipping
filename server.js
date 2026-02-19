import express from 'express';
import fetch from 'node-fetch';
import crypto from 'crypto';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "frame-ancestors *");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  next();
});

const PORT = process.env.PORT || 3000;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';
const APP_URL = process.env.APP_URL || 'https://hfd-shipping.onrender.com';

const tokenStore = {};
const settingsStore = {};

app.get('/auth', (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop parameter');
  const scopes = 'read_orders,read_customers';
  const redirectUri = `${APP_URL}/auth/callback`;
  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${redirectUri}&state=xyz`;
  res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
  const { shop, code } = req.query;
  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: SHOPIFY_API_KEY, client_secret: SHOPIFY_API_SECRET, code }),
    });
    const data = await response.json();
    tokenStore[shop] = data.access_token;
    res.redirect(`/?shop=${shop}`);
  } catch (err) {
    res.status(500).send('Authentication failed: ' + err.message);
  }
});

app.get('/', async (req, res) => {
  const shop = req.query.shop || '';
  const accessToken = tokenStore[shop];
  const settings = settingsStore[shop] || {};

  let ordersHtml = '';

  if (accessToken) {
    try {
      const ordersRes = await fetch(
        `https://${shop}/admin/api/2024-01/orders.json?fulfillment_status=unfulfilled&limit=20`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      const ordersData = await ordersRes.json();
      const orders = ordersData.orders || [];

      if (orders.length === 0) {
        ordersHtml = '<p>אין הזמנות ממתינות למשלוח כרגע.</p>';
      } else {
        ordersHtml = orders.map(order => {
          const addr = order.shipping_address || {};
          const name = (addr.name || order.email || '').replace(/'/g, "\\'");
          const phone = (addr.phone || order.phone || '').replace(/'/g, "\\'");
          const email = (order.email || '').replace(/'/g, "\\'");
          const address = (addr.address1 || '').replace(/'/g, "\\'");
          const city = (addr.city || '').replace(/'/g, "\\'");
          const building = (addr.address2 || '').replace(/'/g, "\\'");
          return `
            <div class="order">
              <div class="order-header">
                <strong>הזמנה #${order.order_number}</strong>
                <span>${addr.name || order.email || ''}</span>
              </div>
              <div class="order-details">
                📍 ${addr.address1 || ''}, ${addr.city || ''} &nbsp;&nbsp; 📞 ${addr.phone || order.phone || ''}
              </div>
              <div class="shipment-buttons">
                <button onclick="openModal('${order.id}','${name}','${phone}','${email}','${address}','${city}','${building}','home')" class="btn-home">🏠 משלוח עד הבית</button>
                <button onclick="openModal('${order.id}','${name}','${phone}','${email}','${address}','${city}','${building}','pickup')" class="btn-pickup">📦 נקודת חלוקה</button>
              </div>
            </div>`;
        }).join('');
      }
    } catch (err) {
      ordersHtml = `<p style="color:red">שגיאה: ${err.message}</p>`;
    }
  } else if (shop) {
    ordersHtml = `<p><a href="/auth?shop=${shop}">לחץ כאן לחבר את החנות</a></p>`;
  }

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>HFD Shipping</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:900px;margin:30px auto;padding:20px;background:#f8f9fa;}
    h1{color:#2c6fad;text-align:center;}
    h2{color:#333;}
    .settings{background:white;padding:20px;border-radius:10px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.1);}
    .order{background:white;padding:15px 20px;margin:10px 0;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.1);}
    .order-header{display:flex;justify-content:space-between;margin-bottom:8px;font-size:16px;}
    .order-details{color:#555;margin-bottom:12px;font-size:14px;}
    .shipment-buttons{display:flex;gap:10px;}
    .btn-home{background:#2c6fad;color:white;padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:14px;}
    .btn-pickup{background:#28a745;color:white;padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:14px;}
    .btn-home:hover{background:#1a5490;} .btn-pickup:hover{background:#218838;}
    input,select{width:100%;padding:8px;margin:4px 0 12px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;}
    label{font-weight:bold;font-size:14px;}
    .save-btn{background:#2c6fad;color:white;padding:10px 24px;border:none;border-radius:6px;cursor:pointer;font-size:15px;}
    .modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:100;}
    .modal-content{background:white;max-width:500px;margin:60px auto;padding:30px;border-radius:12px;direction:rtl;max-height:80vh;overflow-y:auto;}
    .modal h2{margin-top:0;color:#2c6fad;}
    .close-btn{float:left;cursor:pointer;font-size:22px;color:#aaa;background:none;border:none;}
    .submit-btn{background:#2c6fad;color:white;padding:10px 24px;border:none;border-radius:6px;cursor:pointer;font-size:15px;width:100%;margin-top:10px;}
  </style>
</head>
<body>
  <h1>📦 HFD Shipping</h1>
  <div class="settings">
    <h2>הגדרות</h2>
    <form method="POST" action="/save-settings">
      <input type="hidden" name="shop" value="${shop}">
      <label>טוקן HFD:</label>
      <input type="text" name="hfd_token" value="${settings.hfd_token || ''}" placeholder="הכנס את הטוקן שלך מ-HFD" required>
      <label>מספר לקוח HFD:</label>
      <input type="text" name="client_id" value="${settings.client_id || ''}" placeholder="לדוגמה: 9841" required>
      <label>שם השולח:</label>
      <input type="text" name="sender_name" value="${settings.sender_name || ''}" placeholder="שם החנות שלך">
      <label>טלפון השולח:</label>
      <input type="text" name="sender_phone" value="${settings.sender_phone || ''}" placeholder="050-0000000">
      <button type="submit" class="save-btn">שמור הגדרות</button>
    </form>
  </div>
  <h2>הזמנות ממתינות למשלוח</h2>
  ${ordersHtml}

  <div id="shipmentModal" class="modal">
    <div class="modal-content">
      <button class="close-btn" onclick="closeModal()">×</button>
      <h2 id="modalTitle">פתיחת משלוח</h2>
      <form method="POST" action="/create-shipment">
        <input type="hidden" name="shop" value="${shop}">
        <input type="hidden" name="hfd_token" value="${settings.hfd_token || ''}">
        <input type="hidden" name="client_id" value="${settings.client_id || ''}">
        <input type="hidden" name="sender_name" value="${settings.sender_name || ''}">
        <input type="hidden" name="sender_phone" value="${settings.sender_phone || ''}">
        <input type="hidden" name="shipment_type" id="shipmentType">
        <input type="hidden" name="order_id" id="orderId">
        <label>שם הנמען:</label>
        <input type="text" name="receiver_name" id="receiverName" required>
        <label>טלפון:</label>
        <input type="text" name="receiver_phone" id="receiverPhone" required>
        <label>אימייל:</label>
        <input type="text" name="receiver_email" id="receiverEmail">
        <div id="homeFields">
          <label>כתובת:</label>
          <input type="text" name="receiver_address" id="receiverAddress">
          <label>עיר:</label>
          <input type="text" name="receiver_city" id="receiverCity">
          <label>מספר בניין:</label>
          <input type="text" name="receiver_building" id="receiverBuilding">
          <label>דירה:</label>
          <input type="text" name="receiver_appartment">
        </div>
        <div id="pickupFields" style="display:none">
          <label>בחר נקודת חלוקה:</label>
          <select name="pickup_point">
            <option value="">-- בחר נקודה --</option>
          </select>
          <p style="color:#888;font-size:13px">* רשימת נקודות החלוקה תתעדכן בקרוב</p>
        </div>
        <label>הערות למשלוח:</label>
        <input type="text" name="shipment_comments" placeholder="הערות אופציונאליות">
        <button type="submit" class="submit-btn">פתח משלוח HFD</button>
      </form>
    </div>
  </div>

  <script>
    function openModal(orderId, name, phone, email, address, city, building, type) {
      document.getElementById('orderId').value = orderId;
      document.getElementById('receiverName').value = name;
      document.getElementById('receiverPhone').value = phone;
      document.getElementById('receiverEmail').value = email;
      document.getElementById('receiverAddress').value = address;
      document.getElementById('receiverCity').value = city;
      document.getElementById('receiverBuilding').value = building;
      document.getElementById('shipmentType').value = type;
      if (type === 'home') {
        document.getElementById('modalTitle').innerText = '🏠 משלוח עד הבית';
        document.getElementById('homeFields').style.display = 'block';
        document.getElementById('pickupFields').style.display = 'none';
      } else {
        document.getElementById('modalTitle').innerText = '📦 משלוח לנקודת חלוקה';
        document.getElementById('homeFields').style.display = 'none';
        document.getElementById('pickupFields').style.display = 'block';
      }
      document.getElementById('shipmentModal').style.display = 'block';
    }
    function closeModal() {
      document.getElementById('shipmentModal').style.display = 'none';
    }
  </script>
</body>
</html>`);
});

app.post('/save-settings', (req, res) => {
  const { shop, hfd_token, client_id, sender_name, sender_phone } = req.body;
  settingsStore[shop] = { hfd_token, client_id, sender_name, sender_phone };
  res.redirect(`/?shop=${shop}`);
});

app.post('/create-shipment', async (req, res) => {
  const { shop, hfd_token, client_id, sender_name, sender_phone,
    receiver_name, receiver_phone, receiver_email,
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
    client_name: sender_name || "",
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
    sender_name: sender_name || "", sender_phone: sender_phone || "",
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
      res.send(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><style>body{font-family:Arial;max-width:600px;margin:80px auto;text-align:center;}.success{color:green;font-size:22px;}a{color:#2c6fad;}</style></head><body><div class="success">✅ המשלוח נפתח בהצלחה!</div><p>מספר משלוח: <strong>${data.id || data.parcel_id || JSON.stringify(data)}</strong></p><a href="/?shop=${shop}">חזרה להזמנות</a></body></html>`);
    } else {
      res.send(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><style>body{font-family:Arial;max-width:600px;margin:80px auto;text-align:center;}.error{color:red;}a{color:#2c6fad;}</style></head><body><div class="error">❌ שגיאה בפתיחת המשלוח</div><p>${JSON.stringify(data)}</p><a href="/?shop=${shop}">חזרה</a></body></html>`);
    }
  } catch (err) {
    res.send(`<p style="color:red">שגיאה: ${err.message}</p><a href="/?shop=${shop}">חזרה</a>`);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
