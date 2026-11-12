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
import Svg, { Circle, Line, Polyline, G, Defs, Stop, LinearGradient as SvgGradient } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useStatistics } from '../../hooks/useStatistics';
import { useHabits } from '../../hooks/useHabits';
import { StatRange } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { CalendarPickerModal } from '../../components/feature/CalendarPickerModal';
import { parseDate, formatDate } from '../../services/recurrenceService';
import { resolveCategory } from '../../utils/categoryResolver';
import { MoodPatternsCard } from '../../components/feature/MoodPatternsCard';
import { PenaltyLogCard } from '../../components/feature/PenaltyLogCard';
import { KpiTicker } from '../../components/feature/KpiTicker';

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
// `ghost` holds the previous period's buckets — plotted as faded bars behind
// the live ones so the eye catches growth at a glance ("vs last period").
function BarChart({ points, ghost }: {
  points: { label: string; completed: number; failed: number }[];
  ghost?: { label: string; completed: number; failed: number }[] | null;
}) {
  const maxVal = Math.max(
    ...points.map((p) => p.completed + p.failed),
    ...(ghost?.map((p) => p.completed + p.failed) ?? [0]),
    1
  );
  // Truthful axis: the labels must match the scale the bars are drawn on.
  // They were hard-coded [100, 50, 0] while bars normalized to `maxVal`, so
  // any week whose busiest day ≠ 100 rendered a meaningless axis.
  const axisTop = Math.max(2, Math.ceil(maxVal / 2) * 2);
  const barScale = 120 / axisTop;
  const barW = Math.max(12, (CHART_W - (points.length - 1) * 4) / points.length);

  return (
    <View style={bc.container}>
      {/* Y axis labels */}
      <View style={bc.yAxis}>
        {[axisTop, axisTop / 2, 0].map((v) => (
          <Text key={v} style={bc.yLabel}>{v}</Text>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={bc.chart}>
          {points.map((p, i) => {
            const total = p.completed + p.failed;
            // Candy bar cap: the stack's top face gets a glossy light rim.
            const compH = total > 0 ? p.completed * barScale : 0;
            const failH = total > 0 ? p.failed * barScale : 0;
            const g = ghost?.[i];
            const gTotal = g ? g.completed + g.failed : 0;
            const gCompH = g && gTotal > 0 ? g.completed * barScale : 0;
            const gFailH = g && gTotal > 0 ? g.failed * barScale : 0;
            return (
              <View key={i} style={[bc.barGroup, { width: barW }]}>
                <View style={{ width: '100%', height: 120, justifyContent: 'flex-end' }}>
                  {/* Faded previous-period bars, drawn behind the live stack */}
                  {g && gTotal > 0 && (
                    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
                      <View style={[bc.barGhostFail, { height: Math.max(gFailH, 2) }]} />
                      <View style={[bc.barGhostComp, { height: Math.max(gCompH, 2) }]} />
                    </View>
                  )}
                  <View style={bc.barStack}>
                    {failH > 0 && (
                      <LinearGradient
                        colors={['#F87171', '#B91C1C']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={[bc.barFail, { height: failH }]}
                      />
                    )}
                    {compH > 0 && (
                      <LinearGradient
                        colors={['#6EE7B7', '#059669']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={[bc.barComp, { height: compH }]}
                      />
                    )}
                  </View>
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
  barGhostComp: {
    backgroundColor: 'rgba(52,211,153,0.16)',
    borderRadius: 3,
    width: '100%',
    marginBottom: 1,
  },
  barGhostFail: {
    backgroundColor: 'rgba(248,113,113,0.14)',
    borderRadius: 3,
    width: '100%',
    marginBottom: 1,
  },
  barLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center' },
});

// ── Line Chart (SVG) ──────────────────────────────────────────────────────────
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
      <Svg width={W} height={H + 20}>
        {/* Glow-tinted trend gradient */}
        <Defs>
          <SvgGradient id="trendGrad" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={H}>
            <Stop offset="0" stopColor="#67E8F9" />
            <Stop offset="1" stopColor={Colors.primary} />
          </SvgGradient>
        </Defs>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <Line
            key={v}
            x1={0}
            y1={H - v * H}
            x2={W}
            y2={H - v * H}
            stroke={Colors.separator}
            strokeWidth={1}
          />
        ))}
        {/* Line */}
        {pts.length > 1 && (
          <Polyline
            points={pts.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="url(#trendGrad)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {/* Dots — mint candy beads */}
        {pts.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="#67E8F9"
            stroke="#0B1220"
            strokeWidth={1}
          />
        ))}
      </Svg>
    </ScrollView>
  );
}

// ── Pie Chart (SVG) ───────────────────────────────────────────────────────────
function PieChart({ completed, failed, skipped }: { completed: number; failed: number; skipped: number }) {
  const total = completed + failed + skipped;
  if (total === 0) {
    return (
      <View style={pie.empty}>
        <Text style={pie.emptyText}>No data</Text>
      </View>
    );
  }
  const compPct = completed / total;
  const failPct = failed / total;
  const skipPct = skipped / total;

  const segments = [
    { label: 'Completed', value: compPct, color: Colors.success },
    { label: 'Failed', value: failPct, color: Colors.danger },
    { label: 'Skipped', value: skipPct, color: Colors.warning },
  ].filter((s) => s.value > 0);

  const SIZE = 140;
  const STROKE = 22;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;

  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const arc = seg.value * CIRC;
    const offset = cumulative;
    cumulative += arc;
    return { ...seg, arc, offset };
  });

  return (
    <View style={pie.container}>
      <View style={{ width: SIZE, height: SIZE, justifyContent: 'center', alignItems: 'center' }}>
        <Svg width={SIZE} height={SIZE}>
          <G transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((seg) => (
              <Circle
                key={seg.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth={STROKE}
                strokeDasharray={`${seg.arc} ${CIRC - seg.arc}`}
                strokeDashoffset={-seg.offset}
                strokeLinecap="butt"
              />
            ))}
          </G>
        </Svg>
        <View style={pie.centerLabel}>
          <Text style={pie.centerPct}>{Math.round(compPct * 100)}%</Text>
          <Text style={pie.centerSub}>Done</Text>
        </View>
      </View>
      <View style={pie.legend}>
        {segments.map((s) => (
          <View key={s.label} style={pie.legendItem}>
            <View style={[pie.legendDot, { backgroundColor: s.color }]} />
            <Text style={pie.legendLabel}>{s.label}</Text>
            <Text style={pie.legendPct}>{Math.round(s.value * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const pie = StyleSheet.create({
  container: { alignItems: 'center', gap: Spacing.md },
  centerLabel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 7 * (12 + 3), gap: 3 },
  cell: { width: 12, height: 12, borderRadius: 2 },
  cellToday: { borderWidth: 1, borderColor: Colors.primary },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLabel: { fontSize: 10, color: Colors.textMuted },
  legendCell: { width: 10, height: 10, borderRadius: 2 },
});

// ── Stat Cards — candy mini-panels ───────────────────────────────────────────
function StatCard({ icon, label, value, color, subtitle }: { icon: string; label: string; value: string; color: string; subtitle?: string }) {
  return (
    <View style={sc.card}>
      <LinearGradient
        colors={[`${color}1E`, 'rgba(255,255,255,0.02)']}
        start={{ x: 0.25, y: 0 }}
        end={{ x: 0.75, y: 1 }}
        style={sc.cardGrad}
        pointerEvents="none"
      />
      <View style={[sc.iconBox, { backgroundColor: `${color}22`, borderColor: `${color}55`, shadowColor: color }]}>
        <MaterialIcons name={icon as any} size={19} color={color} />
      </View>
      <Text style={[sc.value, { textShadowColor: `${color}44` }]}>{value}</Text>
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
    overflow: 'hidden',
  },
  cardGrad: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    borderWidth: 1,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  value: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textShadowRadius: 7, textShadowOffset: { width: 0, height: 1 } },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted },
});

// ── Section Header — the game banner used across HQ, mirrored here ───────────
function SectionTitle({ title, subtitle, tint, icon }: { title: string; subtitle?: string; tint: string; icon: string }) {
  return (
    <View style={sth.container}>
      <View style={sth.row}>
        <View style={[sth.badge, { borderColor: `${tint}66`, backgroundColor: `${tint}1C`, shadowColor: tint }]}>
          <MaterialIcons name={icon as never} size={12} color={tint} />
        </View>
        <Text style={[sth.title, { color: tint }]}>{title}</Text>
        <LinearGradient
          colors={[`${tint}66`, 'rgba(255,255,255,0)'] as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={sth.line}
          pointerEvents="none"
        />
      </View>
      {subtitle ? <Text style={sth.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}
const sth = StyleSheet.create({
  container: { marginBottom: Spacing.md, marginTop: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  title: { fontSize: 10.5, fontWeight: FontWeight.bold, letterSpacing: 1.6 },
  line: { flex: 1, height: 2, borderRadius: 2, opacity: 0.4, marginLeft: 2 },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4, marginLeft: 29 },
});

// ── Habit Progress Row ────────────────────────────────────────────────────────
function HabitProgressRow({ name, rate, completed, total, streak, color }: {
  name: string; rate: number; completed: number; total: number; streak: number; color: string;
}) {
  return (
    <View style={hr.row}>
      <View style={[hr.dot, { backgroundColor: color, shadowColor: color }]} />
      <View style={hr.info}>
        <View style={hr.topRow}>
          <Text style={hr.name} numberOfLines={1}>{name}</Text>
          <View style={[hr.pctPill, { backgroundColor: `${color}14`, borderColor: `${color}44` }]}>
            <Text style={[hr.pct, { color }]}>{Math.round(rate * 100)}%</Text>
          </View>
        </View>
        <View style={hr.track}>
          <View style={[hr.fill, { width: `${rate * 100}%`, backgroundColor: color, shadowColor: color }]} />
        </View>
        <View style={hr.bottomRow}>
          <Text style={hr.sub}>{completed}/{total} done</Text>
          {streak > 0 ? (
            <View style={hr.streak}>
              <MaterialIcons name="local-fire-department" size={12} color={Colors.warning} />
              <Text style={hr.streakText}>{streak}d streak</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
const hr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.md },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6, flexShrink: 0, shadowOpacity: 0.55, shadowRadius: 5, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
  info: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  name: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, flexShrink: 1 },
  pctPill: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2.5 },
  pct: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  track: { height: 6, backgroundColor: Colors.progressBg, borderRadius: Radius.full, overflow: 'hidden', marginBottom: 4 },
  fill: { height: '100%', borderRadius: Radius.full, shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
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

  const { categories } = useHabits();
  // Merged logic: Stats always aggregate ALL habits across every section —
  // only the Today screen is section/category-wise.
  const { habitStats, dailyPoints, heatmapDailyPoints, monthPoints, prevMonthPoints, pieData, advancedStats, summary } =
    useStatistics(range, refDate);

  const navigateDate = (dir: 'prev' | 'next') => {
    const d = new Date(refDate);
    if (range === 'week') {
      d.setDate(d.getDate() + (dir === 'next' ? 7 : -7));
    } else if (range === 'month') {
      // Step a month while clamping the day: 31 Mar → 28/29 Feb, never the
      // overflow jump to 3 Mar (which silently skipped past February).
      const step = dir === 'next' ? 1 : -1;
      const moved = new Date(d.getFullYear(), d.getMonth() + step, 1);
      const daysInMonth = new Date(moved.getFullYear(), moved.getMonth() + 1, 0).getDate();
      moved.setDate(Math.min(d.getDate(), daysInMonth));
      d.setTime(moved.getTime());
    } else if (range === 'year') {
      d.setFullYear(d.getFullYear() + (dir === 'next' ? 1 : -1));
    }
    setRefDate(d);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Ambient realm backdrop — same night-realm haze as HQ */}
      <LinearGradient
        colors={['rgba(78,142,255,0.09)', 'rgba(0,0,0,0)'] as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bgBand}
        pointerEvents="none"
      />
      <View pointerEvents="none" style={styles.bgOrbA} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerBadge}>
          <Text style={{ fontSize: 16 }}>📊</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle}>Battle Stats</Text>
          <Text style={styles.headerSub} numberOfLines={1}>War reports & analytics</Text>
        </View>
        <View style={styles.headerChip}>
          <Text style={styles.headerChipText}>{Math.round(summary.successRate)}%</Text>
        </View>
      </View>

      {/* Range filter */}
      <View style={styles.rangeBar}>
        {RANGES.map((r) => (
          <Pressable
            key={r.key}
            style={[styles.rangeBtn, range === r.key && styles.rangeBtnActive]}
            onPress={() => setRange(r.key)}
            accessibilityLabel={`Range ${r.label}`}
          >
            {range === r.key && (
              <LinearGradient
                colors={['#4E8EFF', '#2E63C9']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.rangeGrad}
                pointerEvents="none"
              />
            )}
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
        {/* ── 0a. Headline KPI strip — one swipe of the top-of-mind numbers ── */}
        <KpiTicker
          kpis={[
            {
              icon: 'emoji-events',
              label: 'Success Rate',
              value: `${Math.round(summary.successRate)}%`,
              sub: `${summary.completed}/${summary.total} done`,
              color: Colors.success,
            },
            {
              icon: 'check-circle',
              label: 'Completed',
              value: `${summary.completed}`,
              color: Colors.primary,
            },
            {
              icon: 'local-fire-department',
              label: 'Current Streak',
              value: `${advancedStats.currentStreak}d`,
              sub: advancedStats.currentStreakHabit || '—',
              color: Colors.warning,
            },
            {
              icon: 'military-tech',
              label: 'Longest Streak',
              value: `${advancedStats.longestStreak}d`,
              sub: advancedStats.longestStreakHabit || '—',
              color: '#B9F2FF',
            },
            {
              icon: 'trending-up',
              label: 'Growth',
              value: `${advancedStats.growthPct >= 0 ? '+' : ''}${Math.round(advancedStats.growthPct)}%`,
              sub: 'vs previous period',
              color: advancedStats.growthPct >= 0 ? Colors.success : Colors.danger,
            },
          ]}
        />

        {/* ── 0. Analysis layer: mood & penalty patterns (data-side game insight) ── */}
        <View style={styles.gameSection}>
          <MoodPatternsCard />
        </View>

        <View style={styles.gameSection}>
          <PenaltyLogCard />
        </View>

        {/* ── A. Summary ── */}
        <SectionTitle title="BATTLE SUMMARY" tint={Colors.success} icon="leaderboard" />
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
              title="HERO PROGRESS"
              subtitle="Completion scores for all your habits"
              tint={Colors.primary}
              icon="trending-up"
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
        <SectionTitle title="STATUS ORBS" tint="#A78BFA" icon="donut-large" />
        <View style={styles.card}>
          <PieChart
            completed={pieData.completed}
            failed={pieData.failed}
            skipped={pieData.skipped}
          />
        </View>

        {/* ── D. Bar Chart ── */}
        <SectionTitle title="BATTLE HISTORY" tint="#FBBF24" icon="bar-chart" />
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
            {prevMonthPoints && (
              <View style={styles.legendDot}>
                <View style={[styles.dot, { backgroundColor: 'rgba(255,255,255,0.25)' }]} />
                <Text style={styles.legendText}>vs last period</Text>
              </View>
            )}
          </View>
          <BarChart points={monthPoints} ghost={prevMonthPoints} />
        </View>

        {/* ── E. Line Chart ── */}
        <SectionTitle title="MOMENTUM CURVE" tint="#34D399" icon="show-chart" />
        <View style={styles.card}>
          <LineChart points={dailyPoints} />
          <View style={styles.chartLegend}>
            <View style={styles.legendDot}>
              <View style={[styles.dot, { backgroundColor: '#67E8F9' }]} />
              <Text style={styles.legendText}>Daily completion rate</Text>
            </View>
          </View>
        </View>

        {/* ── F. Heatmap ── */}
        <SectionTitle title="REALM CALENDAR" subtitle="Last 12 weeks" tint="#67E8F9" icon="calendar-view-month" />
        <View style={styles.card}>
          <HeatmapCalendar dailyPoints={heatmapDailyPoints} />
        </View>

        {/* ── G. Advanced Insights ── */}
        <SectionTitle title="SKILL REPORT" tint="#A78BFA" icon="insights" />
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
        <SectionTitle title="HABIT LEADERBOARD" subtitle="Ranked by completion rate" tint="#FFC542" icon="emoji-events" />
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
                  <View style={lb.ratePill}>
                    <Text style={lb.rate}>{Math.round(hs.rate * 100)}%</Text>
                  </View>
                </View>
              );
            })}
          {habitStats.length === 0 && (
            <Text style={styles.noDataText}>No habit data yet. Start tracking!</Text>
          )}
        </View>

        {/* Motivational insight */}
        <LinearGradient
          colors={['rgba(251,191,36,0.11)', 'rgba(251,191,36,0.03)', 'rgba(255,255,255,0.02)']}
          locations={[0, 0.45, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.motivCard}
        >
          <View style={styles.motivBadge}>
            <Text style={{ fontSize: 13 }}>💡</Text>
          </View>
          <Text style={styles.motivText}>
            {advancedStats.weeklyConsistency >= 80
              ? 'Outstanding! You are crushing your habits this week.'
              : advancedStats.weeklyConsistency >= 50
              ? 'Good progress! Keep building on your momentum.'
              : advancedStats.dailyAvg > 0
              ? 'Every day is a chance to improve. Keep going!'
              : 'Start your first habit to see insights here.'}
          </Text>
        </LinearGradient>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.separator },
  rank: { fontSize: FontSize.md, width: 30, color: Colors.textSecondary },
  colorDot: { width: 7, height: 7, borderRadius: 4 },
  name: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium, minWidth: 0 },
  ratePill: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.primary}44`,
    backgroundColor: `${Colors.primary}12`,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  rate: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  bgBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 240,
  },
  bgOrbA: {
    position: 'absolute',
    top: -70,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(78,142,255,0.07)',
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginTop: 1,
  },
  headerChip: {
    borderWidth: 1,
    borderColor: `${Colors.success}55`,
    backgroundColor: `${Colors.success}12`,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerChipText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.success,
    letterSpacing: 0.5,
  },
  rangeBar: {
    flexDirection: 'row',
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: Radius.full,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  rangeBtnActive: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 9,
    elevation: 4,
  },
  rangeGrad: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  rangeBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  rangeBtnTextActive: {
    color: '#fff',
    fontWeight: FontWeight.bold,
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
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  dateNavLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  content: {
    paddingHorizontal: Spacing.md,
  },
  gameSection: {
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
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
    width: 7,
    height: 7,
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
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowColor: 'rgba(251,191,36,0.2)',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  motivBadge: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.4)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  motivText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    fontWeight: FontWeight.medium,
    minWidth: 0,
  },
});
