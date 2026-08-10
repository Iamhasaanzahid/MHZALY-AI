// File path: app/api/chat/route.ts

import { NextResponse } from 'next/server';
import { processAdvancedAiCommand } from '@/lib/aiEngine';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Pass the prompt through our advanced local AI brain
    const aiResult = await processAdvancedAiCommand(prompt);

    return NextResponse.json({
      success: true,
      reply: aiResult.reply,
      action: aiResult.action,
      status: aiResult.status,
    });

  } catch (error: any) {
    console.error('AI Core Error:', error);
    return NextResponse.json({ success: false, error: 'Neural processing fault.' }, { status: 500 });
  }
}
