const https = require("https");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret || !keyId.startsWith("rzp_test_")) {
      throw new Error("Razorpay TEST API keys are not configured correctly.");
    }

    const data = JSON.parse(event.body || "{}");
    const fees = {
      "Team Leader": 30000,
      "Retailer": 60000
    };

    const amount = fees[data.role];

    if (!amount) {
      throw new Error("Invalid registration role.");
    }

    const auth = Buffer.from(keyId + ":" + keySecret).toString("base64");

    const order = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "api.razorpay.com",
        path: "/v1/orders",
        method: "POST",
        headers: {
          "Authorization": "Basic " + auth,
          "Content-Type": "application/json"
        }
      }, (res) => {
        let result = "";
        res.on("data", chunk => result += chunk);
        res.on("end", () => {
          const parsed = JSON.parse(result);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(parsed.error?.description || "Order creation failed"));
          } else {
            resolve(parsed);
          }
        });
      });

      req.on("error", reject);
      req.write(JSON.stringify({
        amount,
        currency: "INR",
        receipt: "BS_" + Date.now(),
        notes: { role: data.role, mode: "TEST" }
      }));
      req.end();
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        keyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
      })
    };

  } catch (error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
      
