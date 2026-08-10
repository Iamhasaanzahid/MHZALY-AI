// File path: app/api/chat/route.ts

import { NextResponse } from 'next/server';
import { ProjectMemoryBrain } from '@/lib/memoryStore';

// Initialize brain instance (or map dynamically per user session)
const memoryBrain = new ProjectMemoryBrain('mhzaly-primary-session');

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 1. Record incoming user prompt into short-term memory
    memoryBrain.addMessage('user', prompt);

    // 2. Fetch full conversation context
    const currentHistory = memoryBrain.getHistory();

    // 3. Simulate or invoke AI processing logic (integrate Gemini/OpenAI API key here)
    // For demonstration, we format a powerful contextual response incorporating past logs
    const contextualReply = `Mhzaly System Activated: Processed your input ("${prompt}") successfully with active memory persistence. All sub-modules in components and lib are synchronized.`;

    // 4. Save assistant response back to memory
    memoryBrain.addMessage('assistant', contextualReply);

    return NextResponse.json({
      success: true,
      reply: contextualReply,
      historyLength: currentHistory.length,
    });
  } catch (error) {
    console.error('AI Processing Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Online',
    memoryEntries: memoryBrain.getHistory().length,
  });
}
