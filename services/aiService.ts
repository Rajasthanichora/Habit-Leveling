import { ApiProvider, AiLanguage, TriggerTag } from './types';
import { loadApiConfig, loadActiveProvider, loadAnalysisConfig, addAnalysisHistoryEntry } from './apiService';
import { loadHabits, loadCompletions } from './habitService';
import { computeHabitStats, computePieData, computeAdvancedStats, HabitStat } from './statisticsService';
import { formatDate } from './recurrenceService';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

let cachedContext: string | null = null;
let lastContextBuild: number = 0;
const CONTEXT_CACHE_TTL = 60_000;

export async function getHabitStatsContext(language?: AiLanguage): Promise<string> {
  const now = Date.now();
  if (cachedContext && now - lastContextBuild < CONTEXT_CACHE_TTL) {
    return cachedContext;
  }
  const [habits, completions] = await Promise.all([loadHabits(), loadCompletions()]);
  const refDate = new Date();
  const perHabit = computeHabitStats(habits, completions, 'all', refDate);
  const pie = computePieData(habits, completions, 'all', refDate);
  const advanced = computeAdvancedStats(habits, completions, 'all', refDate);

  const active = habits.filter((h) => !h.archived).length;
  const archived = habits.filter((h) => h.archived).length;
  const totalCompletions = completions.filter((c) => c.completed).length;
  const today = formatDate(new Date());
  const todayCompletions = completions.filter((c) => c.date === today && c.completed).length;
  const todayTotal = habits.filter((h) => !h.archived).length;

  const sections = [...new Set(habits.map((h) => h.sectionId))];
  const categories = [...new Set(habits.map((h) => h.category))];

  const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const ctx = [
    `=== HABIT TRACKER DATA (as of ${today}) ===`,
    '',
    `Total habits: ${habits.length} (${active} active, ${archived} archived)`,
    `Total completions logged: ${totalCompletions}`,
    `Today: ${todayCompletions}/${todayTotal} habits completed`,
    `Sections: ${sections.length} (${sections.join(', ')})`,
    `Categories: ${categories.length} (${categories.join(', ')})`,
    '',
    `=== STATISTICS ===`,
    `Current streak: ${advanced.currentStreak} (habit: ${advanced.currentStreakHabit})`,
    `Longest streak: ${advanced.longestStreak} (habit: ${advanced.longestStreakHabit})`,
    `Most completed habit: ${advanced.mostCompletedHabit}`,
    `Most skipped habit: ${advanced.mostSkippedHabit}`,
    `Best category: ${advanced.bestCategory}`,
    `Worst category: ${advanced.worstCategory}`,
    `Best day: ${weekDays[parseInt(advanced.bestDayOfWeek)] || advanced.bestDayOfWeek}`,
    `Worst day: ${weekDays[parseInt(advanced.worstDayOfWeek)] || advanced.worstDayOfWeek}`,
    `Weekly consistency: ${advanced.weeklyConsistency}%`,
    `Daily average: ${advanced.dailyAvg}`,
    `Growth trend: ${advanced.growthPct > 0 ? '+' : ''}${advanced.growthPct}%`,
    `Overall completion rate: ${pie.completed}/${pie.completed + pie.failed + pie.skipped}`,
    '',
    `=== HABIT LIST ===`,
    ...habits.filter((h) => !h.archived).map((h) => {
      const hStat = perHabit.find((s: HabitStat) => s.habit.id === h.id);
      return `- ${h.name} (priority ${h.priority}, category: ${h.category}): ${hStat ? `${Math.round(hStat.rate * 100)}% completion, streak: ${hStat.streak}` : 'no data'}`;
    }),
    '',
    `You are an AI assistant embedded inside a habit tracker app.`,
    `Answer questions about the user's habits, give suggestions, analyze patterns, and help them stay productive.`,
    `Be concise, friendly, and data-driven. Use the statistics above to give specific advice.`,
    language === 'hindi' ? `IMPORTANT: Always respond in Hindi language only.` :
    language === 'hinglish' ? `IMPORTANT: Always respond in Hinglish (Hindi + English mix, written in Devanagari or Roman script) only.` :
    `IMPORTANT: Always respond in English only.`,
  ].join('\n');

  cachedContext = ctx;
  lastContextBuild = now;
  return ctx;
}

export function clearContextCache() {
  cachedContext = null;
  lastContextBuild = 0;
}

export function isHabitRelatedQuery(text: string): boolean {
  const keywords = [
    'habit', 'habits', 'stat', 'stats', 'statistics', 'streak', 'streaks',
    'progress', 'completion', 'complete', 'completed', 'skip', 'skipped',
    'category', 'categories', 'frequency', 'priority', 'analytics',
    'analysis', 'analyze', 'trend', 'trends', 'consistency', 'rate',
    'performance', 'daily', 'weekly', 'monthly', 'overview', 'summary',
    'data', 'history', 'log', 'track', 'tracker', 'score', 'goal',
    'target', 'achievement', 'improvement', 'insight', 'pattern',
    'routine', 'productivity', 'efficiency', 'count', 'record',
  ];
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

export async function sendChatMessage(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  provider: ApiProvider,
  language?: AiLanguage,
  sectionId?: string,
  includeContext?: boolean,
  triggerTag?: TriggerTag
): Promise<string> {
  let response: string;
  if (provider === 'gemini') {
    response = await sendGeminiMessage(messages, apiKey, model, language, includeContext);
  } else {
    response = await sendOpenRouterMessage(messages, apiKey, model, language, includeContext);
  }
  if (triggerTag) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    addAnalysisHistoryEntry({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      provider,
      model,
      type: 'chat',
      summary: `Chat: ${lastUserMsg?.content?.slice(0, 80) || '?'} → ${response.slice(0, 60)}...`,
      sectionId,
      triggerTag,
    }, sectionId).catch(() => {});
  }
  return response;
}

async function sendGeminiMessage(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  language?: AiLanguage,
  includeContext?: boolean
): Promise<string> {
  let context = '';
  if (includeContext) {
    context = await getHabitStatsContext(language);
  }
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const langOnly = language === 'hindi'
    ? 'IMPORTANT: Always respond in Hindi language only.'
    : language === 'hinglish'
    ? 'IMPORTANT: Always respond in Hinglish (Hindi + English mix, written in Devanagari or Roman script) only.'
    : '';

  const body: any = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };
  if (includeContext && context) {
    body.systemInstruction = { parts: [{ text: context }] };
  } else if (langOnly) {
    body.systemInstruction = { parts: [{ text: langOnly }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
}

async function sendOpenRouterMessage(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  language?: AiLanguage,
  includeContext?: boolean
): Promise<string> {
  let context = '';
  if (includeContext) {
    context = await getHabitStatsContext(language);
  }

  const langOnly = language === 'hindi'
    ? 'IMPORTANT: Always respond in Hindi language only.'
    : language === 'hinglish'
    ? 'IMPORTANT: Always respond in Hinglish (Hindi + English mix, written in Devanagari or Roman script) only.'
    : '';

  const systemContent = includeContext && context ? context : langOnly;
  const apiMessages = systemContent
    ? [
        { role: 'system', content: systemContent },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ]
    : messages.map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://habit-tracker.app',
      'X-Title': 'Habit Tracker AI',
    },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || body?.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || 'No response';
}

export interface ConnectionStatus {
  connected: boolean;
  provider: ApiProvider;
  model: string;
  message: string;
}

export async function generateDailySuggestion(
  sectionHabits: { name: string; rate: number; category: string; priority: number; completed: boolean }[],
  language?: AiLanguage
): Promise<string> {
  try {
    const provider = await loadActiveProvider();
    const config = await loadApiConfig();
    const cfg = provider === 'gemini' ? config.gemini : config.openrouter;
    if (!cfg.apiKey) return 'Configure API key in Settings to get AI suggestions.';

    const completed = sectionHabits.filter((h) => h.completed).map((h) => h.name).join(', ');
    const pending = sectionHabits.filter((h) => !h.completed).map((h) => h.name).join(', ');

    const prompt = `You are a habit coach. Based on today's habits data:
- Completed: ${completed || 'none'}
- Pending: ${pending || 'none'}

Give ONE short, actionable suggestion (2-3 sentences) for what the user should focus on today. Be specific and motivational.`;

    const langHint = language === 'hindi' ? 'Reply in Hindi.' :
      language === 'hinglish' ? 'Reply in Hinglish.' :
      'Reply in English.';

    const msg: ChatMessage[] = [
      { role: 'user', content: `${prompt}\n\n${langHint}` },
    ];

    const response = provider === 'gemini'
      ? await sendGeminiMessage(msg, cfg.apiKey, cfg.model, language, true)
      : await sendOpenRouterMessage(msg, cfg.apiKey, cfg.model, language, true);
    return response;
  } catch {
    return 'Unable to generate suggestion right now.';
  }
}

export async function generateHabitDescriptions(
  habits: { name: string; rate: number; completed: boolean }[],
  language?: AiLanguage
): Promise<Record<string, string>> {
  try {
    const provider = await loadActiveProvider();
    const config = await loadApiConfig();
    const cfg = provider === 'gemini' ? config.gemini : config.openrouter;
    if (!cfg.apiKey) return {};

    const list = habits.map(h =>
      `- ${h.name}: ${Math.round(h.rate * 100)}% completion${h.completed ? ' (done today)' : ''}`
    ).join('\n');

    const prompt = `For each habit below, give ONE short line of personalized advice (max 12 words). Be specific, motivational, and reference their performance.

${list}

Respond in this exact format (one per line):
HabitName: your advice here`;

    const langHint = language === 'hindi' ? 'Reply in Hindi.' :
      language === 'hinglish' ? 'Reply in Hinglish.' :
      'Reply in English.';

    const msg: ChatMessage[] = [
      { role: 'user', content: `${prompt}\n\n${langHint}\n\nIMPORTANT: Keep the "HabitName: advice" format exactly.` },
    ];

    const response = provider === 'gemini'
      ? await sendGeminiMessage(msg, cfg.apiKey, cfg.model, language, true)
      : await sendOpenRouterMessage(msg, cfg.apiKey, cfg.model, language, true);

    const result: Record<string, string> = {};
    const lines = response.split('\n').filter(l => l.includes(':'));
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const name = line.slice(0, idx).trim();
        const advice = line.slice(idx + 1).trim();
        if (name && advice) result[name] = advice;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function testActiveConnection(): Promise<ConnectionStatus> {
  try {
    const provider = await loadActiveProvider();
    const config = await loadApiConfig();
    const cfg = provider === 'gemini' ? config.gemini : config.openrouter;

    if (!cfg.apiKey) {
      return { connected: false, provider, model: cfg.model, message: `No API key saved` };
    }

    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cfg.apiKey)}`,
        { method: 'GET' }
      );
      if (res.ok) return { connected: true, provider, model: cfg.model, message: `${provider}/${cfg.model}` };
      return { connected: false, provider, model: cfg.model, message: 'Gemini API error' };
    } else {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      if (res.ok) return { connected: true, provider, model: cfg.model, message: `${provider}/${cfg.model}` };
      return { connected: false, provider, model: cfg.model, message: 'OpenRouter API error' };
    }
  } catch {
    return { connected: false, provider: 'gemini', model: '', message: 'Connection failed' };
  }
}
