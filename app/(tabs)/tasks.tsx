import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { useHabits } from '../../hooks/useHabits';
import { Habit, AiLanguage, AnalysisFrequency, AnalysisHistoryEntry, TriggerTag } from '../../services/types';
import { loadApiConfig, loadActiveProvider, loadAnalysisConfig, saveAnalysisConfig, getAnalysisHistory, clearAnalysisHistory, addAnalysisHistoryEntry } from '../../services/apiService';
import { testActiveConnection, sendChatMessage, generateHabitDescriptions, ChatMessage, isHabitRelatedQuery, clearContextCache } from '../../services/aiService';
import { computeHabitStats, HabitStat } from '../../services/statisticsService';
import { formatDate, isHabitActiveOnDate } from '../../services/recurrenceService';

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LANGUAGES: { key: AiLanguage; label: string }[] = [
  { key: 'english', label: 'English' },
  { key: 'hindi', label: 'Hindi' },
  { key: 'hinglish', label: 'Hinglish' },
];
const FREQUENCY_OPTIONS: { key: AnalysisFrequency; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'hourly', label: 'Hourly' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
];
const MINUTE_OPTIONS = [1, 5, 10, 15, 30];
const HOUR_OPTIONS = [1, 2, 3, 4, 6, 8, 12];

const TRIGGER_LABELS: Record<TriggerTag, string> = {
  manual_analysis: 'Manual',
  chat_analysis: 'Chat',
  auto_analysis: 'Auto',
};
const TRIGGER_ICONS: Record<TriggerTag, string> = {
  manual_analysis: 'auto-awesome',
  chat_analysis: 'chat',
  auto_analysis: 'schedule',
};
const TRIGGER_COLORS: Record<TriggerTag, string> = {
  manual_analysis: Colors.primary,
  chat_analysis: '#9B59B6',
  auto_analysis: Colors.warning,
};

type HabitStatus = 'good' | 'moderate' | 'alert';

interface AnalyzedHabit {
  habit: Habit;
  status: HabitStatus;
  rate: number;
  title: string;
  description: string;
  expanded: boolean;
}

function getStatus(rate: number): HabitStatus {
  if (rate >= 0.7) return 'good';
  if (rate >= 0.3) return 'moderate';
  return 'alert';
}

function getStatusColor(status: HabitStatus): string {
  switch (status) {
    case 'good': return Colors.success;
    case 'moderate': return Colors.warning;
    case 'alert': return Colors.danger;
  }
}

function getStatusBg(status: HabitStatus): string {
  switch (status) {
    case 'good': return 'rgba(76,175,80,0.1)';
    case 'moderate': return 'rgba(255,149,0,0.1)';
    case 'alert': return 'rgba(255,59,92,0.1)';
  }
}

function getAITitle(habit: Habit, rate: number, status: HabitStatus): string {
  if (status === 'good') return `\u2713 Nailing it: ${habit.name}`;
  if (status === 'moderate') return `\u26A1 Keep going: ${habit.name}`;
  return `! Needs focus: ${habit.name}`;
}

function getAIDescription(habit: Habit, rate: number, status: HabitStatus): string {
  const pct = Math.round(rate * 100);
  if (status === 'good') {
    return `You're completing this habit ${pct}% of the time — excellent consistency! Keep up the great work. This habit is in your sweet spot.`;
  }
  if (status === 'moderate') {
    return `You're at ${pct}% completion. You're making progress but there's room to improve. Try setting a specific time each day to build a stronger routine.`;
  }
  return `Completion is at ${pct}% — this habit needs more attention. Consider breaking it into smaller steps or setting a daily reminder to build momentum.`;
}

function getAIPriority(status: HabitStatus): string {
  switch (status) {
    case 'good': return 'Low priority — keep maintaining';
    case 'moderate': return 'Medium priority — improve gradually';
    case 'alert': return 'High priority — focus on this';
  }
}

export default function AIScreen() {
  const insets = useSafeAreaInsets();
  const { habits, completions, selectedSectionId, sections } = useHabits();
  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name || 'General';

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [providerModel, setProviderModel] = useState('AI');

  // Per-section chat messages
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  const currentMessages = chatMessages[selectedSectionId] || [
    { role: 'assistant' as const, content: 'Hello! Ask me anything about your habits, progress, or statistics!' },
  ];

  // Per-section analysis state
  const [analyzedSections, setAnalyzedSections] = useState<Record<string, boolean>>({});
  const [aiDescriptions, setAiDescriptions] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState(false);

  const today = formatDate(new Date());
  const completionSet = useMemo(() => {
    const set = new Set<string>();
    completions.filter((c) => c.completed).forEach((c) => set.add(c.key));
    return set;
  }, [completions]);

  const sectionHabits = useMemo(
    () => habits.filter((h) => h.sectionId === selectedSectionId && !h.archived && isHabitActiveOnDate(h, today)),
    [habits, selectedSectionId, today]
  );

  const uncompletedToday = useMemo(() => {
    return sectionHabits.filter((h) => !completionSet.has(`${h.id}_${today}`));
  }, [sectionHabits, completionSet, today]);

  const analyzedHabits: AnalyzedHabit[] = useMemo(() => {
    const allHabits = habits.filter((h) => h.sectionId === selectedSectionId && !h.archived);
    const allCompletions = completions;
    const refDate = new Date();
    const stats = computeHabitStats(allHabits, allCompletions, 'all', refDate);

    return uncompletedToday.map((h) => {
      const stat = stats.find((s: HabitStat) => s.habit.id === h.id);
      const rate = stat ? stat.rate : 0;
      const status = getStatus(rate);
      return {
        habit: h,
        status,
        rate,
        title: getAITitle(h, rate, status),
        description: getAIDescription(h, rate, status),
        expanded: false,
      };
    }).sort((a, b) => {
      const order = { alert: 0, moderate: 1, good: 2 };
      return order[a.status] - order[b.status];
    });
  }, [uncompletedToday, habits, completions, selectedSectionId]);

  const [analyzedList, setAnalyzedList] = useState<AnalyzedHabit[]>([]);

  useEffect(() => {
    setAnalyzedList(analyzedHabits.map((h) => ({ ...h, expanded: false })));
  }, [analyzedHabits]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setConnecting(true);
        const result = await testActiveConnection();
        setConnected(result.connected);
        setProviderModel(result.connected ? `${result.provider}/${result.model}` : `${result.provider} disconnected`);
        setConnecting(false);
      })();
    }, [])
  );

  const toggleExpand = (index: number) => {
    setAnalyzedList((prev) =>
      prev.map((item, i) => (i === index ? { ...item, expanded: !item.expanded } : item))
    );
  };

  // ── Trigger 1: Analyze with AI ──
  const handleAnalyze = useCallback(async () => {
    if (analyzing || uncompletedToday.length === 0) return;
    setAnalyzing(true);
    try {
      clearContextCache();
      const cfg = await loadAnalysisConfig(selectedSectionId);
      const data = sectionHabits.map((h) => ({
        name: h.name,
        rate: analyzedHabits.find((a) => a.habit.id === h.id)?.rate ?? 0,
        completed: completionSet.has(`${h.id}_${today}`),
      }));
      const descriptions = await generateHabitDescriptions(data, cfg.language);
      setAiDescriptions((prev) => ({ ...prev, ...descriptions }));
      setAnalyzedSections((prev) => ({ ...prev, [selectedSectionId]: true }));

      const provider = await loadActiveProvider();
      const apiConfig = await loadApiConfig();
      const modelInfo = provider === 'gemini' ? apiConfig.gemini.model : apiConfig.openrouter.model;
      await addAnalysisHistoryEntry({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        provider,
        model: modelInfo,
        type: 'analysis',
        summary: `AI analysis completed for ${sectionName} — ${data.length} habits analyzed`,
        sectionId: selectedSectionId,
        triggerTag: 'manual_analysis',
      }, selectedSectionId);
    } catch {
      setAnalyzedSections((prev) => ({ ...prev, [selectedSectionId]: true }));
    }
    setAnalyzing(false);
  }, [analyzing, uncompletedToday, selectedSectionId, sectionHabits, analyzedHabits, completionSet, today, sectionName]);

  // ── Trigger 2: Chat with context (only when user asks about habits/stats) ──
  const handleSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    const updatedMsgs = [...(chatMessages[selectedSectionId] || currentMessages), userMsg];
    setChatMessages((prev) => ({ ...prev, [selectedSectionId]: updatedMsgs }));
    setSending(true);

    try {
      const provider = await loadActiveProvider();
      const config = await loadApiConfig();
      const cfg = provider === 'gemini' ? config.gemini : config.openrouter;

      if (!cfg.apiKey) {
        const errMsg = { role: 'assistant' as const, content: 'No API key configured. Go to Settings > API to set up your key.' };
        setChatMessages((prev) => ({ ...prev, [selectedSectionId]: [...(prev[selectedSectionId] || currentMessages), userMsg, errMsg] }));
        setSending(false);
        return;
      }

      const analysisCfg = await loadAnalysisConfig(selectedSectionId);
      const isTrigger = isHabitRelatedQuery(text);
      const response = await sendChatMessage(
        updatedMsgs, cfg.apiKey, cfg.model, provider,
        analysisCfg.language, selectedSectionId, isTrigger,
        isTrigger ? 'chat_analysis' : undefined
      );
      const assistantMsg = { role: 'assistant' as const, content: response };
      setChatMessages((prev) => {
        const existing = prev[selectedSectionId] || currentMessages;
        return { ...prev, [selectedSectionId]: [...existing, assistantMsg] };
      });
    } catch (e: any) {
      const errMsg = { role: 'assistant' as const, content: `Error: ${e?.message || 'Something went wrong'}` };
      setChatMessages((prev) => {
        const existing = prev[selectedSectionId] || currentMessages;
        return { ...prev, [selectedSectionId]: [...existing, errMsg] };
      });
    }
    setSending(false);
  }, [chatInput, sending, chatMessages, currentMessages, selectedSectionId]);

  // ── Trigger 3: Auto analysis via frequency ──
  const [autoAnalysisEnabled, setAutoAnalysisEnabled] = useState(false);
  const autoTimerRef = useRef<any>(null);

  const scheduleAutoAnalysis = useCallback(async () => {
    const cfg = await loadAnalysisConfig(selectedSectionId);
    const provider = await loadActiveProvider();
    const apiConfig = await loadApiConfig();
    const modelInfo = provider === 'gemini' ? apiConfig.gemini.model : apiConfig.openrouter.model;
    const cfgProvider = await loadActiveProvider();
    const config = await loadApiConfig();
    const activeCfg = cfgProvider === 'gemini' ? config.gemini : config.openrouter;
    if (!activeCfg.apiKey) return;

    const doAutoAnalysis = async () => {
      if (uncompletedToday.length === 0) return;
      try {
        clearContextCache();
        const data = sectionHabits.map((h) => ({
          name: h.name,
          rate: analyzedHabits.find((a) => a.habit.id === h.id)?.rate ?? 0,
          completed: completionSet.has(`${h.id}_${today}`),
        }));
        const descriptions = await generateHabitDescriptions(data, cfg.language);
        setAiDescriptions((prev) => ({ ...prev, ...descriptions }));
        setAnalyzedSections((prev) => ({ ...prev, [selectedSectionId]: true }));
        await addAnalysisHistoryEntry({
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          provider: cfgProvider,
          model: modelInfo,
          type: 'analysis',
          summary: `Auto analysis for ${sectionName} — ${data.length} habits analyzed`,
          sectionId: selectedSectionId,
          triggerTag: 'auto_analysis',
        }, selectedSectionId);
      } catch {}
    };

    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    setAutoAnalysisEnabled(false);

    if (cfg.frequency === 'none') {
      return;
    }

    if (cfg.frequency === 'minutes') {
      autoTimerRef.current = setInterval(doAutoAnalysis, (cfg.minutesInterval || 5) * 60 * 1000);
      setAutoAnalysisEnabled(true);
    } else if (cfg.frequency === 'hourly') {
      autoTimerRef.current = setInterval(doAutoAnalysis, (cfg.hoursInterval || 1) * 60 * 60 * 1000);
      setAutoAnalysisEnabled(true);
    } else if (cfg.frequency === 'daily') {
      const msUntilMidnight = () => {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        return tomorrow.getTime() - now.getTime();
      };
      const timer = setTimeout(() => {
        doAutoAnalysis();
        autoTimerRef.current = setInterval(doAutoAnalysis, 24 * 60 * 60 * 1000);
      }, msUntilMidnight());
      setAutoAnalysisEnabled(true);
      return () => clearTimeout(timer);
    } else if (cfg.frequency === 'weekly') {
      if (cfg.weekDays && cfg.weekDays.length > 0) {
        const now = new Date();
        const currentDay = now.getDay();
        const sorted = [...cfg.weekDays].sort((a, b) => a - b);
        const nextDay = sorted.find((d) => d > currentDay) ?? sorted[0];
        let diff = nextDay - currentDay;
        if (diff <= 0) diff += 7;
        const msUntilNext = diff * 24 * 60 * 60 * 1000;
        const timer = setTimeout(() => {
          doAutoAnalysis();
          autoTimerRef.current = setInterval(doAutoAnalysis, 7 * 24 * 60 * 60 * 1000);
        }, msUntilNext);
        setAutoAnalysisEnabled(true);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedSectionId, sectionHabits, analyzedHabits, completionSet, today, uncompletedToday, sectionName]);

  useEffect(() => {
    scheduleAutoAnalysis();
    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, [selectedSectionId, scheduleAutoAnalysis]);

  // ── AI Settings State ──
  const [showSettings, setShowSettings] = useState(false);
  const [settingsFrequency, setSettingsFrequency] = useState<AnalysisFrequency>('none');
  const [settingsMinutes, setSettingsMinutes] = useState(5);
  const [settingsHours, setSettingsHours] = useState(1);
  const [settingsWeekDays, setSettingsWeekDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [settingsLanguage, setSettingsLanguage] = useState<AiLanguage>('english');
  const [settingsHistory, setSettingsHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [freqSaved, setFreqSaved] = useState(false);
  const [langSaved, setLangSaved] = useState(false);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    const cfg = await loadAnalysisConfig(selectedSectionId);
    setSettingsFrequency(cfg.frequency);
    setSettingsMinutes(cfg.minutesInterval || 5);
    setSettingsHours(cfg.hoursInterval || 1);
    setSettingsWeekDays(cfg.weekDays || [1, 2, 3, 4, 5]);
    setSettingsLanguage(cfg.language || 'english');
    const history = await getAnalysisHistory(selectedSectionId);
    setSettingsHistory(history);
    setFreqSaved(false);
    setLangSaved(false);
    setSettingsLoading(false);
  }, [selectedSectionId]);

  const handleOpenSettings = useCallback(() => {
    loadSettings();
    setShowSettings(true);
  }, [loadSettings]);

  const handleSaveFrequency = useCallback(async () => {
    const current = await loadAnalysisConfig(selectedSectionId);
    await saveAnalysisConfig({
      ...current,
      frequency: settingsFrequency,
      minutesInterval: settingsMinutes,
      hoursInterval: settingsHours,
      weekDays: settingsWeekDays,
    }, selectedSectionId);
    setFreqSaved(true);
    setTimeout(() => setFreqSaved(false), 2500);
    scheduleAutoAnalysis();
  }, [selectedSectionId, settingsFrequency, settingsMinutes, settingsHours, settingsWeekDays, scheduleAutoAnalysis]);

  const handleSaveLanguage = useCallback(async () => {
    const current = await loadAnalysisConfig(selectedSectionId);
    await saveAnalysisConfig({
      ...current,
      language: settingsLanguage,
    }, selectedSectionId);
    setLangSaved(true);
    setTimeout(() => setLangSaved(false), 2500);
  }, [selectedSectionId, settingsLanguage]);

  const toggleWeekDay = (day: number) => {
    setSettingsWeekDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const hasAnalyzed = analyzedSections[selectedSectionId];

  const triggerTagDisplay = (tag?: TriggerTag) => {
    if (!tag) return null;
    const label = TRIGGER_LABELS[tag];
    const icon = TRIGGER_ICONS[tag];
    const color = TRIGGER_COLORS[tag];
    return (
      <View style={[styles.triggerTag, { backgroundColor: color + '20', borderColor: color + '40' }]}>
        <MaterialIcons name={icon as any} size={10} color={color} />
        <Text style={[styles.triggerTagText, { color }]}>{label}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="smart-toy" size={24} color={Colors.primary} />
          <Text style={styles.headerTitle}>AI</Text>
        </View>
        <View style={styles.statusRow}>
          {connecting ? (
            <ActivityIndicator size="small" color={Colors.textMuted} />
          ) : (
            <>
              <View style={[styles.statusDot, { backgroundColor: connected ? Colors.success : Colors.danger }]} />
              <Text style={[styles.statusLabel, { color: connected ? Colors.success : Colors.danger }]} numberOfLines={1}>
                {sectionName} · {providerModel}
              </Text>
            </>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Chat Interface Card */}
        <Pressable style={styles.chatCard} onPress={() => setShowChat(true)}>
          <View style={styles.chatCardIcon}>
            <MaterialIcons name="chat" size={24} color={Colors.primary} />
          </View>
          <View style={styles.chatCardInfo}>
            <Text style={styles.chatCardTitle}>Chat Interface</Text>
            <Text style={styles.chatCardDesc}>Ask AI anything about your habits & analytics</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
        </Pressable>

        {/* AI Settings Card */}
        <Pressable style={styles.chatCard} onPress={handleOpenSettings}>
          <View style={styles.chatCardIcon}>
            <MaterialIcons name="settings" size={24} color={Colors.primary} />
          </View>
          <View style={styles.chatCardInfo}>
            <Text style={styles.chatCardTitle}>AI Settings</Text>
            <Text style={styles.chatCardDesc}>Configure analysis frequency, language & view history</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
        </Pressable>

        {/* Analyze Button - Trigger 1 */}
        <Pressable
          style={[styles.analyzeBtn, analyzing && { opacity: 0.7 }]}
          onPress={handleAnalyze}
          disabled={analyzing || !connected || uncompletedToday.length === 0}
        >
          {analyzing ? (
            <View style={styles.analyzeBtnContent}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.analyzeBtnText}>Analyzing...</Text>
            </View>
          ) : (
            <View style={styles.analyzeBtnContent}>
              <MaterialIcons name="auto-awesome" size={22} color="#fff" />
              <Text style={styles.analyzeBtnText}>Analyze with AI</Text>
            </View>
          )}
        </Pressable>

        {/* Auto Analysis Status */}
        {autoAnalysisEnabled && (
          <View style={styles.autoStatusRow}>
            <MaterialIcons name="schedule" size={14} color={Colors.warning} />
            <Text style={styles.autoStatusText}>Auto-analysis active</Text>
          </View>
        )}

        {/* Suggestions Section */}
        <View style={styles.suggestionsHeader}>
          <MaterialIcons name="lightbulb-outline" size={18} color={Colors.warning} />
          <Text style={styles.suggestionsTitle}>AI Suggestions for Today</Text>
        </View>

        {!hasAnalyzed ? (
          <View style={styles.analyzePrompt}>
            <MaterialIcons name="auto-awesome" size={40} color={Colors.textMuted} />
            <Text style={styles.analyzePromptTitle}>No analysis yet</Text>
            <Text style={styles.analyzePromptDesc}>
              Tap &quot;Analyze with AI&quot; above to get personalized habit insights and suggestions for this section.
            </Text>
          </View>
        ) : (
          <>
            {analyzedList.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="check-circle" size={48} color={Colors.success} />
                <Text style={styles.emptyTitle}>All done for today!</Text>
                <Text style={styles.emptySubtitle}>No uncompleted habits in this section.</Text>
              </View>
            ) : (
              analyzedList.map((item, index) => {
                const color = getStatusColor(item.status);
                const bg = getStatusBg(item.status);
                return (
                  <Pressable
                    key={item.habit.id}
                    style={[styles.habitCard, { borderLeftColor: color, backgroundColor: bg }]}
                    onPress={() => toggleExpand(index)}
                  >
                    <View style={styles.habitCardTop}>
                      <View style={[styles.aiBadge, { backgroundColor: color }]}>
                        <Text style={styles.aiBadgeText}>AI</Text>
                      </View>
                      <View style={styles.habitCardInfo}>
                        <Text style={[styles.habitCardTitle, { color }]}>{item.title}</Text>
                        <Text style={styles.habitCardName}>{item.habit.name}</Text>
                      </View>
                      <MaterialIcons
                        name={item.expanded ? 'expand-less' : 'expand-more'}
                        size={20}
                        color={Colors.textSecondary}
                      />
                    </View>

                    <View style={[styles.priorityTag, { backgroundColor: color + '20' }]}>
                      <Text style={[styles.priorityTagText, { color }]}>{getAIPriority(item.status)}</Text>
                    </View>

                    {item.expanded && (
                      <View style={styles.descriptionBox}>
                        <Text style={styles.descriptionText}>
                          {aiDescriptions[item.habit.name] || item.description}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* ── Chat Interface Modal (Trigger 2) ── */}
      <Modal visible={showChat} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.chatModal, { paddingTop: insets.top }]}>
          <View style={styles.chatModalHeader}>
            <View style={styles.chatModalHeaderLeft}>
              <MaterialIcons name="chat" size={22} color={Colors.primary} />
              <Text style={styles.chatModalTitle}>AI Chat · {sectionName}</Text>
            </View>
            <Pressable style={styles.chatModalCloseBtn} onPress={() => setShowChat(false)} hitSlop={8}>
              <MaterialIcons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>

          <KeyboardAvoidingView
            style={styles.chatContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
          >
            <ScrollView
              ref={chatScrollRef}
              style={styles.chatScroll}
              contentContainerStyle={styles.chatContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
            >
              {currentMessages.map((msg, i) => (
                <View key={i} style={[styles.chatBubble, msg.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAI]}>
                  <Text style={[styles.chatText, msg.role === 'user' ? styles.chatTextUser : styles.chatTextAI]}>
                    {msg.content}
                  </Text>
                </View>
              ))}
              {sending && (
                <View style={[styles.chatBubble, styles.chatBubbleAI]}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              )}
            </ScrollView>

            <View style={styles.inputBar}>
              <TextInput
                style={styles.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Ask about your habits..."
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={2000}
                editable={!sending}
              />
              <Pressable
                style={[styles.sendBtn, (!chatInput.trim() || sending) && { opacity: 0.5 }]}
                onPress={handleSend}
                disabled={!chatInput.trim() || sending}
              >
                <MaterialIcons name="send" size={22} color="#fff" />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── AI Settings Modal ── */}
      <Modal visible={showSettings} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.chatModal, { paddingTop: insets.top }]}>
          <View style={styles.chatModalHeader}>
            <View style={styles.chatModalHeaderLeft}>
              <MaterialIcons name="settings" size={22} color={Colors.primary} />
              <Text style={styles.chatModalTitle}>AI Settings · {sectionName}</Text>
            </View>
            <Pressable style={styles.chatModalCloseBtn} onPress={() => setShowSettings(false)} hitSlop={8}>
              <MaterialIcons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>

          {settingsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[styles.settingsContent, { paddingBottom: insets.bottom + 40 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* ── Analysis Frequency (Trigger 3) ── */}
              <Text style={styles.settingsSectionTitle}>AI Analysis Frequency (Trigger 3)</Text>
              <View style={styles.settingsCard}>
                <View style={styles.optionRow}>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.key}
                      style={[styles.optionBtn, settingsFrequency === opt.key && styles.optionBtnActive]}
                      onPress={() => setSettingsFrequency(opt.key)}
                    >
                      <Text style={[styles.optionBtnText, settingsFrequency === opt.key && styles.optionBtnTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {settingsFrequency === 'minutes' && (
                  <View style={styles.subSetting}>
                    <Text style={styles.subSettingLabel}>Every</Text>
                    <View style={styles.optionRow}>
                      {MINUTE_OPTIONS.map((m) => (
                        <Pressable
                          key={m}
                          style={[styles.smallOptionBtn, settingsMinutes === m && styles.optionBtnActive]}
                          onPress={() => setSettingsMinutes(m)}
                        >
                          <Text style={[styles.optionBtnText, settingsMinutes === m && styles.optionBtnTextActive]}>
                            {m}m
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
                {settingsFrequency === 'hourly' && (
                  <View style={styles.subSetting}>
                    <Text style={styles.subSettingLabel}>Every</Text>
                    <View style={styles.optionRow}>
                      {HOUR_OPTIONS.map((h) => (
                        <Pressable
                          key={h}
                          style={[styles.smallOptionBtn, settingsHours === h && styles.optionBtnActive]}
                          onPress={() => setSettingsHours(h)}
                        >
                          <Text style={[styles.optionBtnText, settingsHours === h && styles.optionBtnTextActive]}>
                            {h}h
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {settingsFrequency === 'weekly' && (
                  <View style={styles.subSetting}>
                    <Text style={styles.subSettingLabel}>On days</Text>
                    <View style={styles.optionRow}>
                      {WEEK_DAYS.map((day, idx) => (
                        <Pressable
                          key={idx}
                          style={[styles.dayBtn, settingsWeekDays.includes(idx) && styles.dayBtnActive]}
                          onPress={() => toggleWeekDay(idx)}
                        >
                          <Text style={[styles.dayBtnText, settingsWeekDays.includes(idx) && styles.dayBtnTextActive]}>
                            {day}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                <Pressable style={styles.saveBtn} onPress={handleSaveFrequency}>
                  <Text style={styles.saveBtnText}>Save Frequency</Text>
                </Pressable>
                {freqSaved && (
                  <View style={styles.savedIndicator}>
                    <MaterialIcons name="check-circle" size={16} color={Colors.success} />
                    <Text style={styles.savedIndicatorText}>Settings saved successfully</Text>
                  </View>
                )}
              </View>

              {/* ── Analysis History ── */}
              <Text style={styles.settingsSectionTitle}>AI Analysis History</Text>
              <View style={styles.settingsCard}>
                {settingsHistory.length === 0 ? (
                  <Text style={styles.emptyHint}>No analysis history yet.</Text>
                ) : (
                  settingsHistory.slice(0, 30).map((entry) => (
                    <View key={entry.id} style={styles.historyItem}>
                      <View style={styles.historyItemLeft}>
                        <MaterialIcons
                          name={entry.type === 'chat' ? 'chat' : 'analytics'}
                          size={16}
                          color={entry.type === 'chat' ? Colors.primary : Colors.warning}
                        />
                        <View style={styles.historyInfo}>
                          <View style={styles.historyTopRow}>
                            <Text style={styles.historyModel} numberOfLines={1}>
                              {entry.provider}/{entry.model}
                            </Text>
                            {entry.triggerTag && triggerTagDisplay(entry.triggerTag)}
                          </View>
                          <Text style={styles.historySummary} numberOfLines={1}>{entry.summary}</Text>
                          <Text style={styles.historyMeta}>
                            {new Date(entry.timestamp).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
                {settingsHistory.length > 0 && (
                  <Pressable
                    style={[styles.saveBtn, { backgroundColor: Colors.danger + '20', marginTop: Spacing.sm }]}
                    onPress={async () => {
                      await clearAnalysisHistory(selectedSectionId);
                      setSettingsHistory([]);
                    }}
                  >
                    <Text style={[styles.saveBtnText, { color: Colors.danger }]}>Clear History</Text>
                  </Pressable>
                )}
              </View>

              {/* ── AI Language ── */}
              <Text style={styles.settingsSectionTitle}>AI Language</Text>
              <View style={styles.settingsCard}>
                <Text style={styles.subSettingLabel}>Response language for AI chat & suggestions</Text>
                <View style={styles.optionRow}>
                  {LANGUAGES.map((lang) => (
                    <Pressable
                      key={lang.key}
                      style={[styles.optionBtn, settingsLanguage === lang.key && styles.optionBtnActive]}
                      onPress={() => setSettingsLanguage(lang.key)}
                    >
                      <Text style={[styles.optionBtnText, settingsLanguage === lang.key && styles.optionBtnTextActive]}>
                        {lang.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable style={styles.saveBtn} onPress={handleSaveLanguage}>
                  <Text style={styles.saveBtnText}>Save Language</Text>
                </Pressable>
                {langSaved && (
                  <View style={styles.savedIndicator}>
                    <MaterialIcons name="check-circle" size={16} color={Colors.success} />
                    <Text style={styles.savedIndicatorText}>Settings saved successfully</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.separator,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1, justifyContent: 'flex-end' },
  statusDot: { width: 8, height: 8, borderRadius: 4, opacity: 0.9 },
  statusLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, opacity: 0.9, maxWidth: 180 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.lg },

  // Cards
  chatCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 0.5, borderColor: Colors.cardBorder, gap: Spacing.md,
  },
  chatCardIcon: {
    width: 50, height: 50, borderRadius: 16, backgroundColor: Colors.primaryGlow,
    justifyContent: 'center', alignItems: 'center',
  },
  chatCardInfo: { flex: 1, gap: 4 },
  chatCardTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  chatCardDesc: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 18 },

  // Analyze Button
  analyzeBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 16, paddingHorizontal: Spacing.lg,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
  },
  analyzeBtnContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  analyzeBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', letterSpacing: 0.3 },

  // Auto status
  autoStatusRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: `${Colors.warning}12`,
    borderRadius: Radius.full, marginHorizontal: Spacing.xl,
  },
  autoStatusText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.semibold },

  // Analyze prompt (before analysis)
  analyzePrompt: {
    alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.xl,
    borderWidth: 0.5, borderColor: Colors.cardBorder,
  },
  analyzePromptTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  analyzePromptDesc: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  // Suggestions
  suggestionsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  suggestionsTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textMuted },

  // Habit Card
  habitCard: {
    borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 0.5,
    borderColor: Colors.cardBorder, borderLeftWidth: 4, gap: Spacing.md,
  },
  habitCardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  aiBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm },
  aiBadgeText: { fontSize: FontSize.xs, color: '#fff', fontWeight: FontWeight.bold },
  habitCardInfo: { flex: 1, gap: 3 },
  habitCardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  habitCardName: { fontSize: FontSize.sm, color: Colors.textSecondary },
  priorityTag: {
    alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4,
  },
  priorityTagText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  descriptionBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg,
    borderWidth: 0.5, borderColor: Colors.cardBorder,
  },
  descriptionText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22 },

  // Chat Modal (shared with Settings)
  chatModal: { flex: 1, backgroundColor: Colors.background },
  chatModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.separator,
  },
  chatModalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chatModalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  chatModalCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 0.5, borderColor: Colors.cardBorder },
  chatContainer: { flex: 1 },
  chatScroll: { flex: 1 },
  chatContent: { padding: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.md },
  chatBubble: { maxWidth: '85%', borderRadius: Radius.lg, padding: Spacing.md },
  chatBubbleUser: { backgroundColor: Colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  chatBubbleAI: { backgroundColor: Colors.card, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 0.5, borderColor: Colors.cardBorder },
  chatText: { fontSize: FontSize.md, lineHeight: 22 },
  chatTextUser: { color: '#fff' },
  chatTextAI: { color: Colors.textPrimary },

  // Context Toggle
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderTopWidth: 0.5, borderTopColor: Colors.separator, gap: Spacing.sm, backgroundColor: Colors.background,
  },
  chatInput: {
    flex: 1, backgroundColor: Colors.inputBg, borderWidth: 0.5, borderColor: Colors.inputBorder,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 12, color: Colors.textPrimary,
    fontSize: FontSize.md, maxHeight: 120,
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },

  // Settings
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  settingsContent: { padding: Spacing.lg, gap: Spacing.xl },
  settingsSectionTitle: {
    fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.4,
  },
  settingsCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg,
    borderWidth: 0.5, borderColor: Colors.cardBorder, gap: Spacing.md,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optionBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: Radius.full,
    backgroundColor: Colors.chipBg, borderWidth: 0.5, borderColor: Colors.cardBorder,
  },
  optionBtnActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  optionBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  optionBtnTextActive: { color: Colors.primary, fontWeight: FontWeight.semibold },
  subSetting: { gap: Spacing.sm, paddingTop: Spacing.xs },
  subSettingLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  smallOptionBtn: {
    width: 48, height: 38, borderRadius: Radius.sm,
    backgroundColor: Colors.chipBg, borderWidth: 0.5, borderColor: Colors.cardBorder,
    justifyContent: 'center', alignItems: 'center',
  },
  dayBtn: {
    width: 44, height: 38, borderRadius: Radius.sm,
    backgroundColor: Colors.chipBg, borderWidth: 0.5, borderColor: Colors.cardBorder,
    justifyContent: 'center', alignItems: 'center',
  },
  dayBtnActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  dayBtnText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  dayBtnTextActive: { color: Colors.primary, fontWeight: FontWeight.semibold },
  saveBtn: {
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.full,
    paddingVertical: 12, alignItems: 'center',
  },
  saveBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold },
  savedIndicator: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  savedIndicatorText: { fontSize: FontSize.sm, color: Colors.success, fontWeight: FontWeight.medium },

  // History
  historyItem: {
    paddingVertical: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.separator,
  },
  historyItemLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  historyInfo: { flex: 1, gap: 3 },
  historyTopRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap',
  },
  historyModel: {
    fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary,
  },
  triggerTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm,
    borderWidth: 0.5,
  },
  triggerTagText: {
    fontSize: 10, fontWeight: FontWeight.bold,
  },
  historySummary: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 1 },
  historyMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  emptyHint: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg },
});
