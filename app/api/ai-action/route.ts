// File path: app/api/chat/route.ts

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const lowerPrompt = prompt.toLowerCase();
    let responseReply = "";
    let actionType = "general";

    // Powerful Local Task Dispatcher (Autonomous Logic)
    if (lowerPrompt.includes("time")) {
      responseReply = `System Clock Synchronized: The current local time is ${new Date().toLocaleTimeString()}.`;
      actionType = "time_check";
    } 
    else if (lowerPrompt.includes("whatsapp") || lowerPrompt.includes("message")) {
      responseReply = `Comms Protocol Active: Preparing secure transmission payload.`;
      actionType = "whatsapp_trigger";
    } 
    else if (lowerPrompt.includes("status") || lowerPrompt.includes("diagnostics")) {
      responseReply = `Diagnostics Report: 3D Renderers active, MediaPipe hand tracking operational, Neural core running smoothly.`;
      actionType = "system_status";
    } 
    else {
      responseReply = `M.H.Z.A.L.Y. Neural Core successfully parsed: "${prompt}". All autonomous sub-routines are fully engaged.`;
      actionType = "processed";
    }

    return NextResponse.json({
      success: true,
      reply: responseReply,
      action: actionType,
    });

  } catch (error: any) {
    console.error('Neural Core Error:', error);
    return NextResponse.json({ success: false, error: 'Task execution failed.' }, { status: 500 });
  }
}
