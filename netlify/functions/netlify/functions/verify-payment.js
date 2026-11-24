const https = require("https");
const crypto = require("crypto");

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
    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !secret || !keyId.startsWith("rzp_test_")) {
      throw new Error("Razorpay TEST keys not configured.");
    }

    const data = JSON.parse(event.body || "{}");

    const fees = {
      "Team Leader": 30000,
      "Retailer": 60000
    };

    const expectedAmount = fees[data.role];

    if (!expectedAmount || !data.razorpay_order_id ||
        !data.razorpay_payment_id || !data.razorpay_signature) {
      throw new Error("Invalid payment details.");
    }

    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(data.razorpay_order_id + "|" + data.razorpay_payment_id)
      .digest("hex");

    const received = Buffer.from(data.razorpay_signature, "hex");
    const generated = Buffer.from(generatedSignature, "hex");

    if (
      received.length !== generated.length ||
      !crypto.timingSafeEqual(received, generated)
    ) {
      throw new Error("Payment signature verification failed.");
    }

    const auth = Buffer.from(keyId + ":" + secret).toString("base64");

    const payment = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "api.razorpay.com",
        path: "/v1/payments/" + encodeURIComponent(data.razorpay_payment_id),
        method: "GET",
        headers: {
          "Authorization": "Basic " + auth
        }
      }, (res) => {
        let result = "";
        res.on("data", chunk => result += chunk);
        res.on("end", () => {
          const parsed = JSON.parse(result);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error("Unable to verify payment with Razorpay."));
          } else {
            resolve(parsed);
          }
        });
      });

      req.on("error", reject);
      req.end();
    });

    if (
      payment.order_id !== data.razorpay_order_id ||
      payment.amount !== expectedAmount ||
      payment.currency !== "INR" ||
      !["authorized", "captured"].includes(payment.status)
    ) {
      throw new Error("Payment amount, order or status does not match.");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ verified: true })
    };

  } catch (error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        verified: false,
        error: error.message
      })
    };
  }
};
    
