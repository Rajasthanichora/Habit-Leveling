// Powered by OnSpace.AI
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useStatistics } from '../../hooks/useStatistics';
import { useHabits } from '../../hooks/useHabits';
import { StatRange } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { CalendarPickerModal } from '../../components/feature/CalendarPickerModal';
import { parseDate, formatDate } from '../../services/recurrenceService';
import { resolveCategory } from '../../utils/categoryResolver';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - Spacing.md * 2 - 32;

const RANGES: { key: StatRange; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All Time' },
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatRefDate(range: StatRange, date: Date): string {
  const m = MONTHS_SHORT[date.getMonth()];
  const y = date.getFullYear();
  if (range === 'week') {
    const start = new Date(date); start.setDate(start.getDate() - 6);
    return `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} – ${m} ${date.getDate()}`;
  }
  if (range === 'month') return `${m} ${y}`;
  if (range === 'year') return `${y}`;
  return 'All Time';
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────
function BarChart({ points }: { points: { label: string; completed: number; failed: number }[] }) {
  const maxVal = Math.max(...points.map((p) => p.completed + p.failed), 1);
  const barW = Math.max(12, (CHART_W - (points.length - 1) * 4) / points.length);

  return (
    <View style={bc.container}>
      {/* Y axis labels */}
      <View style={bc.yAxis}>
        {[100, 50, 0].map((v) => (
          <Text key={v} style={bc.yLabel}>{v}</Text>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={bc.chart}>
          {points.map((p, i) => {
            const total = p.completed + p.failed;
            const compH = total > 0 ? (p.completed / maxVal) * 120 : 0;
            const failH = total > 0 ? (p.failed / maxVal) * 120 : 0;
            return (
              <View key={i} style={[bc.barGroup, { width: barW }]}>
                <View style={bc.barStack}>
                  {failH > 0 && <View style={[bc.barFail, { height: failH }]} />}
                  {compH > 0 && <View style={[bc.barComp, { height: compH }]} />}
                </View>
                <Text style={bc.barLabel} numberOfLines={1}>{p.label}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
const bc = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', marginTop: Spacing.sm },
  yAxis: { width: 28, justifyContent: 'space-between', height: 130, paddingBottom: 20, marginRight: 4 },
  yLabel: { fontSize: 9, color: Colors.textMuted },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, minHeight: 140 },
  barGroup: { alignItems: 'center', gap: 4 },
  barStack: { width: '100%', justifyContent: 'flex-end', height: 120, gap: 1 },
  barComp: { backgroundColor: Colors.success, borderRadius: 3, width: '100%' },
  barFail: { backgroundColor: Colors.danger, borderRadius: 3, width: '100%' },
  barLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center' },
});

// ── Simple Line Chart ─────────────────────────────────────────────────────────
function LineChart({ points }: { points: { date: string; rate: number }[] }) {
  const sample = points.length > 30
    ? points.filter((_, i) => i % Math.ceil(points.length / 30) === 0)
    : points;
  const H = 100;
  const W = Math.max(CHART_W, sample.length * 14);
  const pts = sample.map((p, i) => ({
    x: sample.length > 1 ? (i / (sample.length - 1)) * W : W / 2,
    y: H - p.rate * H,
  }));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ width: W, height: H + 20 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <View
            key={v}
            style={{
              position: 'absolute',
              top: H - v * H,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: Colors.separator,
            }}
          />
        ))}
        {/* Dots */}
        {pts.map((p, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: p.x - 3,
              top: p.y - 3,
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: Colors.primary,
            }}
          />
        ))}
        {/* Line (approximated with dots) */}
        {pts.slice(1).map((p, i) => {
          const prev = pts[i];
          const dx = p.x - prev.x;
          const dy = p.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View
              key={`line-${i}`}
              style={{
                position: 'absolute',
                left: prev.x,
                top: prev.y,
                width: len,
                height: 2,
                backgroundColor: Colors.primary,
                transform: [{ rotate: `${angle}deg` }],
                transformOrigin: '0% 50%',
                opacity: 0.7,
              }}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

// ── Pie Chart ─────────────────────────────────────────────────────────────────
function PieChart({ completed, failed, skipped }: { completed: number; failed: number; skipped: number }) {
  const total = completed + failed + skipped;
  if (total === 0) {
    return (
      <View style={pie.empty}>
        <Text style={pie.emptyText}>No data</Text>
      </View>
    );
  }
  const compPct = Math.round((completed / total) * 100);
  const failPct = Math.round((failed / total) * 100);
  const skipPct = 100 - compPct - failPct;

  const segments = [
    { label: 'Completed', value: compPct, color: Colors.success },
    { label: 'Failed', value: failPct, color: Colors.danger },
    { label: 'Skipped', value: skipPct, color: Colors.warning },
  ].filter((s) => s.value > 0);

  const SIZE = 140;
  const STROKE = 22;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;

  return (
    <View style={pie.container}>
      {/* SVG-like approximation using stacked views */}
      <View style={[pie.circle, { width: SIZE, height: SIZE }]}>
        <View style={pie.centerLabel}>
          <Text style={pie.centerPct}>{compPct}%</Text>
          <Text style={pie.centerSub}>Done</Text>
        </View>
        {/* Segment bars as visual representation */}
        <View style={pie.segRow}>
          {segments.map((s) => (
            <View
              key={s.label}
              style={[pie.segBar, { flex: s.value, backgroundColor: s.color }]}
            />
          ))}
        </View>
      </View>
      <View style={pie.legend}>
        {segments.map((s) => (
          <View key={s.label} style={pie.legendItem}>
            <View style={[pie.legendDot, { backgroundColor: s.color }]} />
            <Text style={pie.legendLabel}>{s.label}</Text>
            <Text style={pie.legendPct}>{s.value}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const pie = StyleSheet.create({
  container: { alignItems: 'center', gap: Spacing.md },
  circle: {
    borderRadius: 999,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  segRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 8,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  segBar: { height: 8 },
  centerLabel: { alignItems: 'center' },
  centerPct: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  centerSub: { fontSize: FontSize.xs, color: Colors.textSecondary },
  legend: { gap: Spacing.xs, alignSelf: 'stretch' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  legendPct: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.bold },
  empty: { height: 100, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm },
});

// ── Heatmap Calendar (last 12 weeks) ─────────────────────────────────────────
function HeatmapCalendar({ dailyPoints }: { dailyPoints: { date: string; rate: number; total: number }[] }) {
  const last84 = dailyPoints.slice(-84);
  const today = formatDate(new Date());

  return (
    <View style={hm.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={hm.grid}>
          {last84.map((p) => {
            const isToday = p.date === today;
            const opacity = p.total === 0 ? 0.08 : 0.15 + p.rate * 0.85;
            return (
              <View
                key={p.date}
                style={[
                  hm.cell,
                  { backgroundColor: `rgba(41,121,255,${opacity})` },
                  isToday && hm.cellToday,
                ]}
              />
            );
          })}
        </View>
      </ScrollView>
      <View style={hm.legendRow}>
        <Text style={hm.legendLabel}>Less</Text>
        {[0.08, 0.3, 0.55, 0.8, 1].map((o) => (
          <View key={o} style={[hm.legendCell, { backgroundColor: `rgba(41,121,255,${o})` }]} />
        ))}
        <Text style={hm.legendLabel}>More</Text>
      </View>
    </View>
  );
}
const hm = StyleSheet.create({
  container: { gap: Spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 12 * 7 * 13, gap: 3 },
  cell: { width: 12, height: 12, borderRadius: 2 },
  cellToday: { borderWidth: 1, borderColor: Colors.primary },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLabel: { fontSize: 10, color: Colors.textMuted },
  legendCell: { width: 10, height: 10, borderRadius: 2 },
});

// ── Stat Cards ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, subtitle }: { icon: string; label: string; value: string; color: string; subtitle?: string }) {
  return (
    <View style={sc.card}>
      <View style={[sc.iconBox, { backgroundColor: `${color}22` }]}>
        <MaterialIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={sc.value}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
      {subtitle ? <Text style={sc.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  value: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted },
});

// ── Section Header ────────────────────────────────────────────────────────────
function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={sth.container}>
      <Text style={sth.title}>{title}</Text>
      {subtitle ? <Text style={sth.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}
const sth = StyleSheet.create({
  container: { marginBottom: Spacing.md, marginTop: Spacing.lg },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
});

// ── Habit Progress Row ────────────────────────────────────────────────────────
function HabitProgressRow({ name, rate, completed, total, streak, color }: {
  name: string; rate: number; completed: number; total: number; streak: number; color: string;
}) {
  return (
    <View style={hr.row}>
      <View style={[hr.dot, { backgroundColor: color }]} />
      <View style={hr.info}>
        <View style={hr.topRow}>
          <Text style={hr.name} numberOfLines={1}>{name}</Text>
          <Text style={hr.pct}>{Math.round(rate * 100)}%</Text>
        </View>
        <View style={hr.track}>
          <View style={[hr.fill, { width: `${rate * 100}%`, backgroundColor: color }]} />
        </View>
        <View style={hr.bottomRow}>
          <Text style={hr.sub}>{completed}/{total} done</Text>
          {streak > 0 ? (
            <View style={hr.streak}>
              <MaterialIcons name="local-fire-department" size={12} color={Colors.warning} />
              <Text style={hr.streakText}>{streak}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
const hr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },
  info: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, flex: 1, marginRight: 8 },
  pct: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  track: { height: 6, backgroundColor: Colors.progressBg, borderRadius: Radius.full, overflow: 'hidden', marginBottom: 4 },
  fill: { height: '100%', borderRadius: Radius.full },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sub: { fontSize: FontSize.xs, color: Colors.textMuted },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  streakText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.bold },
});

// ── Advanced Insight Row ──────────────────────────────────────────────────────
function InsightRow({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <View style={ir.row}>
      <MaterialIcons name={icon as any} size={18} color={color ?? Colors.primary} />
      <Text style={ir.label}>{label}</Text>
      <Text style={[ir.value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}
const ir = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.separator },
  label: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  value: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
});

// ── Main Statistics Screen ────────────────────────────────────────────────────
export default function StatisticsScreen() {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<StatRange>('week');
  const [refDate, setRefDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { selectedSectionId, categories } = useHabits();
  const { habitStats, dailyPoints, monthPoints, pieData, advancedStats, summary } =
    useStatistics(range, refDate, selectedSectionId);

  const navigateDate = (dir: 'prev' | 'next') => {
    const d = new Date(refDate);
    if (range === 'week') d.setDate(d.getDate() + (dir === 'next' ? 7 : -7));
    else if (range === 'month') d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
    else if (range === 'year') d.setFullYear(d.getFullYear() + (dir === 'next' ? 1 : -1));
    setRefDate(d);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Statistics</Text>
      </View>

      {/* Range filter */}
      <View style={styles.rangeBar}>
        {RANGES.map((r) => (
          <Pressable
            key={r.key}
            style={[styles.rangeBtn, range === r.key && styles.rangeBtnActive]}
            onPress={() => setRange(r.key)}
          >
            <Text style={[styles.rangeBtnText, range === r.key && styles.rangeBtnTextActive]}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Date nav */}
      {range !== 'all' && (
        <View style={styles.dateNav}>
          <Pressable onPress={() => navigateDate('prev')} hitSlop={8} style={styles.navArrow}>
            <MaterialIcons name="chevron-left" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Pressable onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateNavLabel}>{formatRefDate(range, refDate)}</Text>
          </Pressable>
          <Pressable onPress={() => navigateDate('next')} hitSlop={8} style={styles.navArrow}>
            <MaterialIcons name="chevron-right" size={24} color={Colors.textPrimary} />
          </Pressable>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      >
        {/* ── A. Summary ── */}
        <SectionTitle title="Summary" />
        <View style={styles.cardGrid}>
          <StatCard
            icon="emoji-events"
            label="Success Rate"
            value={`${Math.round(summary.successRate)}%`}
            color={Colors.success}
            subtitle={`${summary.completed} completed`}
          />
          <StatCard
            icon="check-circle"
            label="Completed"
            value={`${summary.completed}`}
            color={Colors.primary}
            subtitle={`of ${summary.total} total`}
          />
          <StatCard
            icon="cancel"
            label="Failed"
            value={`${summary.failed}`}
            color={Colors.danger}
          />
          <StatCard
            icon="skip-next"
            label="Skipped"
            value={`${summary.skipped}`}
            color={Colors.warning}
          />
        </View>

        {/* ── B. Habit Progress ── */}
        {habitStats.length > 0 && (
          <>
            <SectionTitle
              title="Habit Progress"
              subtitle="Completion scores for all your habits"
            />
            <View style={styles.card}>
              {habitStats.map((hs) => {
                const resolved = resolveCategory(hs.habit.category, categories);
                return (
                  <HabitProgressRow
                    key={hs.habit.id}
                    name={hs.habit.name}
                    rate={hs.rate}
                    completed={hs.completed}
                    total={hs.total}
                    streak={hs.streak}
                    color={resolved.color}
                  />
                );
              })}
            </View>
          </>
        )}

        {/* ── C. Pie Chart ── */}
        <SectionTitle title="Habit Status Distribution" />
        <View style={styles.card}>
          <PieChart
            completed={pieData.completed}
            failed={pieData.failed}
            skipped={pieData.skipped}
          />
        </View>

        {/* ── D. Bar Chart ── */}
        <SectionTitle title="Habit Status Over Time" />
        <View style={styles.card}>
          <View style={styles.chartLegend}>
            <View style={styles.legendDot}>
              <View style={[styles.dot, { backgroundColor: Colors.success }]} />
              <Text style={styles.legendText}>Completed</Text>
            </View>
            <View style={styles.legendDot}>
              <View style={[styles.dot, { backgroundColor: Colors.danger }]} />
              <Text style={styles.legendText}>Failed</Text>
            </View>
          </View>
          <BarChart points={monthPoints} />
        </View>

        {/* ── E. Line Chart ── */}
        <SectionTitle title="Completion Trend Over Time" />
        <View style={styles.card}>
          <LineChart points={dailyPoints} />
          <View style={styles.chartLegend}>
            <View style={styles.legendDot}>
              <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
              <Text style={styles.legendText}>Daily completion rate</Text>
            </View>
          </View>
        </View>

        {/* ── F. Heatmap ── */}
        <SectionTitle title="Habit Heatmap" subtitle="Last 12 weeks" />
        <View style={styles.card}>
          <HeatmapCalendar dailyPoints={dailyPoints} />
        </View>

        {/* ── G. Advanced Insights ── */}
        <SectionTitle title="Advanced Insights" />
        <View style={styles.card}>
          <InsightRow icon="local-fire-department" label="Current Streak" value={`${advancedStats.currentStreak} days`} color={Colors.warning} />
          <InsightRow icon="emoji-events" label="Longest Streak" value={`${advancedStats.longestStreak} days`} color={Colors.success} />
          <InsightRow icon="star" label="Most Completed" value={advancedStats.mostCompletedHabit} />
          <InsightRow icon="remove-circle-outline" label="Most Skipped" value={advancedStats.mostSkippedHabit} color={Colors.danger} />
          <InsightRow icon="category" label="Best Category" value={resolveCategory(advancedStats.bestCategory, categories).name} color={Colors.success} />
          <InsightRow icon="trending-down" label="Weakest Category" value={resolveCategory(advancedStats.worstCategory, categories).name} color={Colors.danger} />
          <InsightRow icon="today" label="Best Day of Week" value={advancedStats.bestDayOfWeek} color={Colors.success} />
          <InsightRow icon="event-busy" label="Worst Day of Week" value={advancedStats.worstDayOfWeek} color={Colors.danger} />
          <InsightRow icon="av-timer" label="Daily Avg Completion" value={`${Math.round(advancedStats.dailyAvg)}%`} />
          <InsightRow icon="speed" label="Weekly Consistency" value={`${Math.round(advancedStats.weeklyConsistency)}%`} />
          <InsightRow icon="insights" label="Monthly Productivity" value={`${Math.round(advancedStats.monthlyProductivity)}%`} />
          <InsightRow
            icon="trending-up"
            label="Progress Growth"
            value={`${advancedStats.growthPct >= 0 ? '+' : ''}${Math.round(advancedStats.growthPct)}%`}
            color={advancedStats.growthPct >= 0 ? Colors.success : Colors.danger}
          />
        </View>

        {/* ── Leaderboard ── */}
        <SectionTitle title="Habit Leaderboard" subtitle="Ranked by completion rate" />
        <View style={styles.card}>
          {[...habitStats]
            .sort((a, b) => b.rate - a.rate)
            .slice(0, 10)
            .map((hs, i) => {
              const resolved = resolveCategory(hs.habit.category, categories);
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <View key={hs.habit.id} style={lb.row}>
                  <Text style={lb.rank}>{medals[i] ?? `#${i + 1}`}</Text>
                  <View style={[lb.colorDot, { backgroundColor: resolved.color }]} />
                  <Text style={lb.name} numberOfLines={1}>{hs.habit.name}</Text>
                  <Text style={lb.rate}>{Math.round(hs.rate * 100)}%</Text>
                </View>
              );
            })}
          {habitStats.length === 0 && (
            <Text style={styles.noDataText}>No habit data yet. Start tracking!</Text>
          )}
        </View>

        {/* Motivational insight */}
        <View style={styles.motivCard}>
          <MaterialIcons name="lightbulb" size={20} color={Colors.warning} />
          <Text style={styles.motivText}>
            {advancedStats.weeklyConsistency >= 80
              ? 'Outstanding! You are crushing your habits this week.'
              : advancedStats.weeklyConsistency >= 50
              ? 'Good progress! Keep building on your momentum.'
              : advancedStats.dailyAvg > 0
              ? 'Every day is a chance to improve. Keep going!'
              : 'Start your first habit to see insights here.'}
          </Text>
        </View>
      </ScrollView>

      <CalendarPickerModal
        visible={showDatePicker}
        selectedDate={formatDate(refDate)}
        onSelectDate={(d) => { setRefDate(parseDate(d)); }}
        onClose={() => setShowDatePicker(false)}
        title="Select Date"
      />
    </View>
  );
}

const lb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.separator },
  rank: { fontSize: FontSize.md, width: 30 },
  colorDot: { width: 8, height: 8, borderRadius: 4 },
  name: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  rate: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  rangeBar: {
    flexDirection: 'row',
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.full,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  rangeBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  rangeBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  rangeBtnTextActive: {
    color: '#fff',
    fontWeight: FontWeight.semibold,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  navArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateNavLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  content: {
    paddingHorizontal: Spacing.md,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: Spacing.sm,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  chartLegend: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  legendDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  noDataText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  motivCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,149,0,0.1)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.3)',
    marginBottom: Spacing.md,
  },
  motivText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    fontWeight: FontWeight.medium,
  },
});
