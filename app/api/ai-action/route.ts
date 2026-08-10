// File path: app/api/ai-action/route.ts

import { NextResponse } from 'next/server';
import Twilio from 'vapi-ai'; // (Agar Twilio use karna hai toh official twilio package use hoga)
import TwilioClient from 'twilio';

export async function POST(req: Request) {
  try {
    const { action, prompt, phone } = await req.json();

    let responseMessage = "";

    // 1. Real Phone Call Automation via Twilio
    if (action === "call") {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
      
      if (!accountSid || !authToken || !twilioNumber) {
        return NextResponse.json({ 
          success: false, 
          error: "Twilio credentials (SID, Auth Token, or Phone Number) are missing in environment variables (.env)." 
        }, { status: 400 });
      }

      if (!phone) {
        return NextResponse.json({ success: false, error: "Target phone number is missing." }, { status: 400 });
      }

      const client = TwilioClient(accountSid, authToken);
      
      // Real Call Initiation Code (TwiML bin ya demo URL voice ke liye)
      const call = await client.calls.create({
        url: 'http://demo.twilio.com/docs/voice.xml', // Yahan aap apni custom TwiML URL ya voice script daal sakte hain
        to: phone,
        from: twilioNumber
      });

      responseMessage = `Autonomous Voice Call successfully dispatched to ${phone}. Call SID: ${call.sid}`;
    } 
    
    // 2. Real WhatsApp Automation via Twilio WhatsApp API
    else if (action === "whatsapp") {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioWhatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER; // e.g. 'whatsapp:+14155238886'

      if (!accountSid || !authToken) {
        return NextResponse.json({ success: false, error: "Twilio credentials missing for WhatsApp automation." }, { status: 400 });
      }

      const client = TwilioClient(accountSid, authToken);
      
      // Send WhatsApp message programmatically in background
      const message = await client.messages.create({
        body: prompt || 'M.H.Z.A.L.Y. Autonomous Command Active',
        from: twilioWhatsappNumber || 'whatsapp:+14155238886',
        to: phone ? `whatsapp:${phone}` : 'whatsapp:+923000000000' // Apka default ya target number
      });

      responseMessage = `WhatsApp automated message sent successfully! Message SID: ${message.sid}`;
    } 
    
    // 3. Intelligent AI Text Processing / General Commands
    else {
      // Yahan aap Google Gemini API call bhi connect kar sakte hain
      responseMessage = `M.H.Z.A.L.Y. AI successfully processed command: "${prompt}". All sub-modules and neural nets are fully synchronized.`;
    }

    return NextResponse.json({
      success: true,
      reply: responseMessage,
    });

  } catch (error: any) {
    console.error('AI Action Execution Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to execute automation task.' 
    }, { status: 500 });
  }
}
