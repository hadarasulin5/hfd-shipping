import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// ===== דף הבית של האפליקציה =====
app.get('/', (req, res) => {
  const shop = req.query.shop || '';
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <title>HFD Shipping</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #2c6fad; }
        .order { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 8px; }
        button { background: #2c6fad; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
        button:hover { background: #1a5490; }
        .success { color: green; font-weight: bold; }
        .error { color: red; font-weight: bold; }
        input { width: 100%; padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        label { font-weight: bold; }
        .settings { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <h1>📦 HFD Shipping</h1>
      
      <div class="settings">
        <h2>הגדרות</h2>
        <form method="POST" action="/save-settings">
          <input type="hidden" name="shop" value="${shop}">
          <label>טוקן HFD:</label>
          <input type="text" name="hfd_token" placeholder="הכנס את הטוקן שלך מ-HFD" required>
          <br><br>
          <label>מספר לקוח HFD (client_id):</label>
          <input type="text" name="client_id" placeholder="למשל: 9841" required>
          <br><br>
          <button type="submit">שמור הגדרות</button>
        </form>
      </div>

      <h2>הזמנות ממתינות למשלוח</h2>
      <p>לאחר שמירת ההגדרות, ההזמנות מהחנות שלך יופיעו כאן ותוכל לפתוח משלוח HFD בלחיצת כפתור.</p>
    </body>
    </html>
  `);
});

// ===== שמירת הגדרות =====
app.post('/save-settings', (req, res) => {
  const { hfd_token, client_id, shop } = req.body;
  // בגרסה הבאה נשמור ב-database, כרגע מחזיר אישור
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head><meta charset="UTF-8"><title>HFD Shipping</title>
    <style>body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }</style>
    </head>
    <body>
      <h1>✅ ההגדרות נשמרו!</h1>
      <p>טוקן HFD: ${hfd_token.substring(0, 20)}...</p>
      <p>מספר לקוח: ${client_id}</p>
      <a href="/?shop=${shop}">חזרה</a>
    </body>
    </html>
  `);
});

// ===== יצירת משלוח HFD =====
app.post('/create-shipment', async (req, res) => {
  const {
    hfd_token,
    client_id,
    receiver_name,
    receiver_phone,
    receiver_email,
    receiver_city_id,
    receiver_street_id,
    receiver_building,
    receiver_appartment,
  } = req.body;

  const today = new Date();
  const execution_date = today.toISOString().slice(0, 10).replace(/-/g, '');
  const execution_time = today.toTimeString().slice(0, 8).replace(/:/g, '');

  const payload = {
    action_type: "סגירה",
    cargo_type_id_delivery: 10,
    client_id: parseInt(client_id),
    client_name: "",
    client_order_number: "",
    execution_date,
    execution_time,
    govina: [],
    hadpes: true,
    id_2: "",
    ovala: "חבילה",
    packages_qty_away: 1,
    receiver_appartment: receiver_appartment || "",
    receiver_building: receiver_building || "",
    receiver_city: { id: parseInt(receiver_city_id) },
    receiver_city_id: parseInt(receiver_city_id),
    receiver_comments: "",
    receiver_email: receiver_email || "",
    receiver_entrance: "",
    receiver_floor: "",
    receiver_name,
    receiver_phone,
    receiver_street: { id: receiver_street_id },
    receiver_street_id,
    return_to_shipments_page: false,
    save_add: false,
    sender_appartment: "",
    sender_building: "",
    sender_city: { id: 5000 },
    sender_city_id: 5000,
    sender_comments: "",
    sender_email: "",
    sender_entrance: "",
    sender_floor: "",
    sender_name: "",
    sender_phone: "",
    sender_street: { id: "404" },
    sender_street_id: "404",
    shipment_comments: "",
    shipment_type_id: 35,
    sub_payment: "",
  };

  try {
    const response = await fetch('https://ws2.hfd.co.il/rest/v2/parcels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hfd_token}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      res.json({ success: true, data });
    } else {
      res.json({ success: false, error: data });
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ===== Health check =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
