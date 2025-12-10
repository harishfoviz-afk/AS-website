// netlify/functions/send-email.js

export const handler = async (event) => {
  // 1. Security Check: Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // 2. Environment Check
  if (!process.env.BREVO_API_KEY) {
      console.error("BREVO_API_KEY is missing in Netlify Environment Variables");
      return { statusCode: 500, body: "Server Misconfiguration: Missing API Key" };
  }

  try {
    // 3. Parse the incoming data
    const { userEmail, userName, pdfBase64 } = JSON.parse(event.body);

    if (!userEmail || !pdfBase64) {
      console.error("Missing email or PDF data");
      return { statusCode: 400, body: "Missing required fields" };
    }

    // 4. CLEAN THE PDF & SIZE CHECK
    // Remove the data URI prefix
    const cleanBase64 = pdfBase64.replace(/^data:.+;base64,/, '');
    
    // Calculate approximate size in MB (Base64 string length * 0.75 / 1024 / 1024)
    const sizeInMB = (cleanBase64.length * 0.75) / (1024 * 1024);
    
    // Brevo Limit is ~10MB, Netlify Limit is ~6MB for request/response bodies.
    // If it's over 9MB, we skip the attachment to prevent a crash, 
    // but still send the email with a note.
    let attachments = [];
    if (sizeInMB < 9) {
        attachments = [{
          content: cleanBase64,
          name: "AptSkola-Admissions-Toolkit.pdf",
          type: "application/pdf"
        }];
    } else {
        console.warn(`PDF too large (${sizeInMB.toFixed(2)} MB). Sending email without attachment.`);
    }
    
    const url = "https://api.brevo.com/v3/smtp/email";
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    };

    // ==========================================
    // EMAIL 1: Instant PDF Delivery
    // ==========================================
    const pdfEmailPayload = {
      sender: { email: "connect@aptskola.com", name: "Apt Skola Support" },
      to: [{ email: userEmail, name: userName || "Parent" }],
      subject: "Safe Keeping: Your AptSkola Admission Toolkit",
      htmlContent: `
        <html>
          <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <h2>Here is your Admission Toolkit.</h2>
            <p>Hi ${userName || "Parent"},</p>
            <p>As requested, here is the PDF copy of your <strong>AptSkola Report</strong> for your records.</p>
            <p>We recommend saving this file to your phone so you have it handy when visiting schools.</p>
            ${sizeInMB >= 9 ? '<p><strong>Note:</strong> Your report file was unusually large and could not be attached. Please reply to this email if you need us to send it manually.</p>' : ''}
            <br>
            <p>Best,</p>
            <p><strong>The AptSkola Team</strong></p>
          </body>
        </html>
      `,
      attachment: attachments,
    };

    // Send the First Email
    const pdfResponse = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(pdfEmailPayload),
    });

    if (!pdfResponse.ok) {
      const errorData = await pdfResponse.json();
      console.error("Brevo PDF Email Failed:", JSON.stringify(errorData));
      // Return success to frontend so user flow isn't interrupted, but log error
      return { statusCode: 200, body: JSON.stringify({ warning: "Email failed", detail: errorData }) };
    }

    // ==========================================
    // EMAIL 2: Scheduled Feedback (72 Hours Later)
    // ==========================================
    try {
        const scheduledTime = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
        const feedbackEmailPayload = {
          sender: { email: "connect@aptskola.com", name: "Harish from AptSkola" }, 
          to: [{ email: userEmail, name: userName || "Parent" }],
          subject: "One quick question about your kid's admission...",
          htmlContent: `
            <html>
              <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <p>Hi ${userName || "Parent"},</p>
                <p>It’s been 3 days since you downloaded the toolkit. I’m curious—did the <strong>Fee Forecaster</strong> scare you, or did the <strong>School Checklist</strong> help?</p>
                <p>I read every reply. Could you hit reply and tell me:</p>
                <p><strong>What is the one thing in the report that surprised you the most?</strong></p>
                <br>
                <p>Best,</p>
                <p>Rahul<br>Founder, AptSkola</p>
              </body>
            </html>
          `,
          scheduledAt: scheduledTime, 
        };

        await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(feedbackEmailPayload),
        });
        console.log("Feedback email scheduled successfully.");
    } catch (schedErr) {
        console.warn("Scheduling Error (Non-Critical):", schedErr);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Emails processed successfully" }),
    };

  } catch (error) {
    console.error("Critical Function Error:", error);
    return { statusCode: 500, body: error.toString() };
  }
};
