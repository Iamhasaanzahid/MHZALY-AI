// File path: lib/memoryStore.ts

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

// Simple in-memory store for active session threads (can be swapped with Redis/Upstash later)
const sessionMemory: Map<string, ChatMessage[]> = new Map();

export class ProjectMemoryBrain {
  private sessionId: string;

  constructor(sessionId: string = 'default-session') {
    this.sessionId = sessionId;
    if (!sessionMemory.has(this.sessionId)) {
      sessionMemory.set(this.sessionId, [
        {
          role: 'system',
          content: 'You are Mhzaly, an advanced, highly intelligent AI assistant integrated into a custom Next.js environment.',
          timestamp: Date.now(),
        },
      ]);
    }
  }

  public getHistory(): ChatMessage[] {
    return sessionMemory.get(this.sessionId) || [];
  }

  public addMessage(role: 'user' | 'assistant', content: string): void {
    const history = sessionMemory.get(this.sessionId);
    if (history) {
      history.push({ role, content, timestamp: Date.now() });
      // Keep memory trimmed to the last 20 messages for performance optimization
      if (history.length > 21) {
        const systemPrompt = history[0];
        const recentMessages = history.slice(-20);
        sessionMemory.set(this.sessionId, [systemPrompt, ...recentMessages]);
      }
    }
  }

  public clearMemory(): void {
    sessionMemory.delete(this.sessionId);
  }
}
