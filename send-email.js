// netlify/functions/send-email.js

export const handler = async (event) => {
  // 1. Security Check: Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // 2. Parse the incoming data
    const { userEmail, userName, pdfBase64 } = JSON.parse(event.body);

    // 3. Validation
    if (!userEmail || !pdfBase64) {
      console.error("Missing email or PDF data");
      return { statusCode: 400, body: "Missing required fields" };
    }

    // 4. CLEAN THE PDF: Strip the Data URI prefix if present
    const cleanBase64 = pdfBase64.replace(/^data:.+;base64,/, '');
    
    // Brevo API URL
    const url = "https://api.brevo.com/v3/smtp/email";
    
    // Common Headers
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    };

    // ==========================================
    // OPERATION 1: Send Instant PDF (The Receipt)
    // ==========================================
    const pdfEmailPayload = {
      sender: { email: "connect@aptskola.com", name: "Apt Skola Support" },
      to: [{ email: userEmail, name: userName || "Parent" }],
      subject: "Safe Keeping: Your AptSkola Admission Toolkit",
      htmlContent: `
        <html>
          <body style="font-family: Arial, sans-serif; color: #333;">
            <h2>Here is your Admission Toolkit.</h2>
            <p>Hi ${userName || "Parent"},</p>
            <p>As requested, here is the PDF copy of your <strong>AptSkola Report</strong> for your records.</p>
            <p>We recommend saving this file to your phone so you have it handy when visiting schools.</p>
            <br>
            <p>Best,</p>
            <p><strong>The AptSkola Team</strong></p>
          </body>
        </html>
      `,
      attachment: [
        {
          content: cleanBase64,
          name: "AptSkola-Admissions-Toolkit.pdf",
          type: "application/pdf"
        },
      ],
    };

    // Send the First Email
    const pdfResponse = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(pdfEmailPayload),
    });

    if (!pdfResponse.ok) {
      const errorData = await pdfResponse.json();
      console.error("PDF Email Failed:", JSON.stringify(errorData));
      // If PDF fails, we stop here and report error.
      return { statusCode: pdfResponse.status, body: JSON.stringify(errorData) };
    }

    // ==========================================
    // OPERATION 2: Schedule Feedback Email (The Nudge)
    // ==========================================
    
    // Calculate Time: Now + 72 Hours
    const scheduledTime = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const feedbackEmailPayload = {
      // REPLACE THESE WITH YOUR REAL PERSONAL DETAILS
      sender: { email: "Harish@aptskola.com", name: "Harish from AptSkola" }, 
      to: [{ email: userEmail, name: userName || "Parent" }],
      subject: "One quick question about your kid's admission...",
      htmlContent: `
        <html>
          <body style="font-family: Arial, sans-serif; color: #333;">
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
      // The Magic Parameter: Schedules it for 3 days later
      scheduledAt: scheduledTime, 
    };

    // Send the Second Email (Fire and Forget logic)
    // We wrap this in a separate try/catch so if scheduling fails, the user still gets their PDF success message.
    try {
      const scheduleResponse = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(feedbackEmailPayload),
      });
      
      if (!scheduleResponse.ok) {
        const schedError = await scheduleResponse.json();
        console.warn("Scheduling Feedback Email Failed (Non-Critical):", JSON.stringify(schedError));
      } else {
        console.log("Feedback Email Scheduled Successfully");
      }
    } catch (schedErr) {
      console.warn("Scheduling Error:", schedErr);
    }

    // ==========================================
    // FINAL SUCCESS RESPONSE
    // ==========================================
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Report sent & Feedback scheduled!" }),
    };

  } catch (error) {
    console.error("Critical Function Error:", error);
    return { statusCode: 500, body: error.toString() };
  }
};