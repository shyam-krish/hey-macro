import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Circle, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { getTrendData, getMealAverages } from '../services/storage';
import { TrendDataPoint, MealAverages, MealAverage } from '../types';

const ACCENT_COLOR = '#3FE0DB';
const CALORIE_COLOR = ACCENT_COLOR;
const WEIGHT_COLOR = '#F59E0B';

const CHART_HEIGHT = 220;
const CHART_PADDING_LEFT = 50;
const CHART_PADDING_RIGHT_DEFAULT = 30;
const CHART_PADDING_RIGHT_DUAL = 45;
const CHART_PADDING_TOP = 16;
const CHART_PADDING_BOTTOM = 32;

type RangeKey = '7d' | '30d' | '90d';

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
];

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatLocalDate(d);
}

function formatAxisDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${parseInt(month)}/${parseInt(day)}`;
}

/** Compute nice Y-axis bounds: round min down, max up to nearest step */
function niceRange(values: number[]): { min: number; max: number; step: number } {
  if (values.length === 0) return { min: 0, max: 100, step: 25 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min = min - 10;
    max = max + 10;
  }
  const range = max - min;
  // Pick a step that gives roughly 4 ticks, with a minimum step of 0.5
  const rawStep = Math.max(range / 4, 0.2);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = Math.max(Math.ceil(rawStep / magnitude) * magnitude, 0.2);
  const precision = step < 1 ? 10 / step : 1;
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  min = Math.round(min * precision) / precision;
  max = Math.round(max * precision) / precision;
  return { min, max, step };
}

function LineChart({
  data,
  showCalories,
  showWeight,
  chartWidth,
}: {
  data: TrendDataPoint[];
  showCalories: boolean;
  showWeight: boolean;
  chartWidth: number;
}) {
  if (data.length === 0) {
    return (
      <View style={[chartStyles.emptyContainer, { height: CHART_HEIGHT }]}>
        <Text style={chartStyles.emptyText}>No data for this range</Text>
      </View>
    );
  }

  const paddingRight = (showCalories && showWeight) ? CHART_PADDING_RIGHT_DUAL : CHART_PADDING_RIGHT_DEFAULT;
  const plotWidth = chartWidth - CHART_PADDING_LEFT - paddingRight;
  const plotHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

  // Filter to points with actual data
  const caloriePoints = showCalories
    ? data.filter((d) => d.calories !== null && d.calories > 0)
    : [];
  const weightPoints = showWeight
    ? data.filter((d) => d.weight !== null)
    : [];

  // Compute Y ranges
  const calRange = niceRange(caloriePoints.map((d) => d.calories!));
  const weightRange = niceRange(weightPoints.map((d) => d.weight!));

  // X mapping: evenly spaced across data length
  const xScale = (i: number) =>
    CHART_PADDING_LEFT + (data.length === 1 ? plotWidth / 2 : (i / (data.length - 1)) * plotWidth);

  // Y mapping helpers
  const yCalorie = (val: number) =>
    CHART_PADDING_TOP + plotHeight - ((val - calRange.min) / (calRange.max - calRange.min)) * plotHeight;
  const yWeight = (val: number) =>
    CHART_PADDING_TOP + plotHeight - ((val - weightRange.min) / (weightRange.max - weightRange.min)) * plotHeight;

  // Build polyline points strings
  const buildPolyline = (
    points: TrendDataPoint[],
    yFn: (val: number) => number,
    valueKey: 'calories' | 'weight'
  ): string => {
    return points
      .map((p) => {
        const idx = data.indexOf(p);
        const x = xScale(idx);
        const y = yFn(p[valueKey]!);
        return `${x},${y}`;
      })
      .join(' ');
  };

  // X-axis labels — pick ~5 evenly spaced
  const labelCount = Math.min(5, data.length);
  const labelIndices: number[] = [];
  if (data.length <= labelCount) {
    for (let i = 0; i < data.length; i++) labelIndices.push(i);
  } else {
    for (let i = 0; i < labelCount; i++) {
      labelIndices.push(Math.round((i / (labelCount - 1)) * (data.length - 1)));
    }
  }

  // Y-axis ticks
  const calTicks: number[] = [];
  if (showCalories) {
    for (let v = calRange.min; v <= calRange.max; v += calRange.step) calTicks.push(v);
  }
  const weightTicks: number[] = [];
  if (showWeight) {
    for (let v = weightRange.min; v <= weightRange.max; v += weightRange.step) weightTicks.push(Math.round(v * 100) / 100);
  }

  // Use calorie ticks for left axis, weight ticks for right if both shown
  const leftTicks = showCalories ? calTicks : weightTicks;
  const leftYFn = showCalories ? yCalorie : yWeight;
  return (
    <Svg width={chartWidth} height={CHART_HEIGHT}>
      {/* Background */}
      <Rect x={0} y={0} width={chartWidth} height={CHART_HEIGHT} fill="transparent" />

      {/* Horizontal grid lines */}
      {leftTicks.map((tick) => (
        <Line
          key={`grid-${tick}`}
          x1={CHART_PADDING_LEFT}
          x2={chartWidth - paddingRight}
          y1={leftYFn(tick)}
          y2={leftYFn(tick)}
          stroke="#222"
          strokeWidth={1}
        />
      ))}

      {/* Left Y-axis labels */}
      {leftTicks.map((tick) => (
        <SvgText
          key={`ytick-${tick}`}
          x={CHART_PADDING_LEFT - 6}
          y={leftYFn(tick) + 4}
          textAnchor="end"
          fontSize={11}
          fill="#666"
          fontFamily="DIN Alternate"
        >
          {String(tick)}
        </SvgText>
      ))}

      {/* Right Y-axis labels (weight, only if both series shown) */}
      {showCalories && showWeight && weightTicks.map((tick) => (
        <SvgText
          key={`wytick-${tick}`}
          x={chartWidth - paddingRight + 6}
          y={yWeight(tick) + 4}
          textAnchor="start"
          fontSize={11}
          fill={WEIGHT_COLOR}
          fontFamily="DIN Alternate"
        >
          {Number.isInteger(tick) ? String(tick) : tick.toFixed(1)}
        </SvgText>
      ))}

      {/* X-axis labels */}
      {labelIndices.map((idx) => (
        <SvgText
          key={`xlabel-${idx}`}
          x={xScale(idx)}
          y={CHART_HEIGHT - 6}
          textAnchor="middle"
          fontSize={11}
          fill="#666"
          fontFamily="DIN Alternate"
        >
          {formatAxisDate(data[idx].date)}
        </SvgText>
      ))}

      {/* Calorie line */}
      {showCalories && caloriePoints.length > 1 && (
        <Polyline
          points={buildPolyline(caloriePoints, yCalorie, 'calories')}
          fill="none"
          stroke={CALORIE_COLOR}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {/* Calorie dots */}
      {showCalories && caloriePoints.map((p) => {
        const idx = data.indexOf(p);
        return (
          <Circle
            key={`cal-${idx}`}
            cx={xScale(idx)}
            cy={yCalorie(p.calories!)}
            r={3}
            fill={CALORIE_COLOR}
          />
        );
      })}

      {/* Weight line */}
      {showWeight && weightPoints.length > 1 && (
        <Polyline
          points={buildPolyline(weightPoints, yWeight, 'weight')}
          fill="none"
          stroke={WEIGHT_COLOR}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {/* Weight dots */}
      {showWeight && weightPoints.map((p) => {
        const idx = data.indexOf(p);
        return (
          <Circle
            key={`wt-${idx}`}
            cx={xScale(idx)}
            cy={yWeight(p.weight!)}
            r={3}
            fill={WEIGHT_COLOR}
          />
        );
      })}
    </Svg>
  );
}

const chartStyles = StyleSheet.create({
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'Avenir Next',
  },
});

const MEAL_ROWS: { key: keyof Omit<MealAverages, 'loggedDays' | 'total'>; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

function MealAverageRow({
  label,
  avg,
  maxCalories,
  isTotal,
}: {
  label: string;
  avg: MealAverage;
  maxCalories: number;
  isTotal?: boolean;
}) {
  const barFraction = maxCalories > 0 ? avg.calories / maxCalories : 0;
  return (
    <View style={[mealStyles.row, isTotal && mealStyles.totalRow]}>
      <View style={mealStyles.rowHeader}>
        <Text style={[mealStyles.mealLabel, isTotal && mealStyles.totalLabel]}>{label}</Text>
        <Text style={[mealStyles.mealCalories, isTotal && mealStyles.totalLabel]}>
          {avg.calories.toLocaleString()} cal
        </Text>
      </View>
      {!isTotal && (
        <View style={mealStyles.barTrack}>
          <View style={[mealStyles.barFill, { width: `${Math.round(barFraction * 100)}%` }]} />
        </View>
      )}
      <Text style={mealStyles.macroText}>
        {avg.protein}g P · {avg.carbs}g C · {avg.fat}g F
      </Text>
    </View>
  );
}

function MealAveragesSection({ averages }: { averages: MealAverages | null }) {
  if (!averages || averages.loggedDays === 0) {
    return (
      <View style={mealStyles.container}>
        <Text style={mealStyles.sectionTitle}>Avg per meal</Text>
        <Text style={chartStyles.emptyText}>No meals logged for this range</Text>
      </View>
    );
  }

  const maxCalories = Math.max(
    averages.breakfast.calories,
    averages.lunch.calories,
    averages.dinner.calories,
    averages.snacks.calories,
    1
  );

  return (
    <View style={mealStyles.container}>
      <View style={mealStyles.sectionHeader}>
        <Text style={mealStyles.sectionTitle}>Avg per meal</Text>
        <Text style={mealStyles.sectionSubtitle}>
          over {averages.loggedDays} logged {averages.loggedDays === 1 ? 'day' : 'days'}
        </Text>
      </View>
      {MEAL_ROWS.map((m) => (
        <MealAverageRow
          key={m.key}
          label={m.label}
          avg={averages[m.key]}
          maxCalories={maxCalories}
        />
      ))}
      <MealAverageRow label="Total" avg={averages.total} maxCalories={maxCalories} isTotal />
    </View>
  );
}

const mealStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  sectionSubtitle: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'Avenir Next',
  },
  row: {
    gap: 6,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
    marginTop: 2,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  mealLabel: {
    color: '#ddd',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    fontWeight: '500',
  },
  totalLabel: {
    color: '#fff',
    fontWeight: '600',
  },
  mealCalories: {
    color: ACCENT_COLOR,
    fontSize: 14,
    fontFamily: 'DIN Alternate',
    fontWeight: 'bold',
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2a2a2a',
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT_COLOR,
  },
  macroText: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'DIN Alternate',
  },
});

export function TrendsScreen() {
  const navigation = useNavigation();
  const [data, setData] = useState<TrendDataPoint[]>([]);
  const [mealAverages, setMealAverages] = useState<MealAverages | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>('30d');
  const [showCalories, setShowCalories] = useState(true);
  const [showWeight, setShowWeight] = useState(true);
  const [chartWidth, setChartWidth] = useState(0);

  const loadData = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const endDate = formatLocalDate(new Date());
      const startDate = getDateNDaysAgo(days);
      const [result, averages] = await Promise.all([
        getTrendData('default-user', startDate, endDate),
        getMealAverages('default-user', startDate, endDate),
      ]);
      setData(result);
      setMealAverages(averages);
    } catch {
      setData([]);
      setMealAverages(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    loadData(days);
  }, [range, loadData]);

  // Summary stats
  const calorieAvg = (() => {
    const vals = data.filter((d) => d.calories !== null && d.calories > 0).map((d) => d.calories!);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  })();

  const weightStart = (() => {
    const first = data.find((d) => d.weight !== null);
    return first?.weight ?? null;
  })();

  const weightEnd = (() => {
    const last = [...data].reverse().find((d) => d.weight !== null);
    return last?.weight ?? null;
  })();

  const weightChange = weightStart !== null && weightEnd !== null
    ? Math.round((weightEnd - weightStart) * 10) / 10
    : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trends</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Range Picker */}
        <View style={styles.rangePicker}>
          {RANGES.map((r) => (
            <TouchableOpacity
              key={r.key}
              style={[styles.rangeButton, range === r.key && styles.rangeButtonActive]}
              onPress={() => setRange(r.key)}
            >
              <Text style={[styles.rangeButtonText, range === r.key && styles.rangeButtonTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Toggles */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleButton, showCalories && styles.toggleButtonActiveCalories]}
            onPress={() => {
              if (showCalories && !showWeight) return; // keep at least one
              setShowCalories((v) => !v);
            }}
          >
            <View style={[styles.toggleDot, { backgroundColor: CALORIE_COLOR }]} />
            <Text style={[styles.toggleText, showCalories && styles.toggleTextActive]}>
              Calories
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, showWeight && styles.toggleButtonActiveWeight]}
            onPress={() => {
              if (showWeight && !showCalories) return; // keep at least one
              setShowWeight((v) => !v);
            }}
          >
            <View style={[styles.toggleDot, { backgroundColor: WEIGHT_COLOR }]} />
            <Text style={[styles.toggleText, showWeight && styles.toggleTextActive]}>
              Weight
            </Text>
          </TouchableOpacity>
        </View>

        {/* Chart */}
        <View
          style={styles.chartContainer}
          onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
        >
          {loading ? (
            <View style={{ height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : chartWidth > 0 ? (
            <LineChart
              data={data}
              showCalories={showCalories}
              showWeight={showWeight}
              chartWidth={chartWidth}
            />
          ) : null}
        </View>

        {/* Summary Stats */}
        <View style={styles.statsRow}>
          {calorieAvg !== null && (
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Avg Calories</Text>
              <Text style={[styles.statValue, { color: CALORIE_COLOR }]}>
                {calorieAvg.toLocaleString()}
              </Text>
            </View>
          )}
          {weightChange !== null && (
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Weight Change</Text>
              <Text style={[styles.statValue, { color: WEIGHT_COLOR }]}>
                {weightChange > 0 ? '+' : ''}{weightChange} lbs
              </Text>
            </View>
          )}
        </View>

        {/* Per-meal Averages */}
        {!loading && <MealAveragesSection averages={mealAverages} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  content: {
    padding: 20,
    gap: 20,
  },
  rangePicker: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 3,
  },
  rangeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  rangeButtonActive: {
    backgroundColor: '#333',
  },
  rangeButtonText: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  rangeButtonTextActive: {
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  toggleButtonActiveCalories: {
    borderColor: CALORIE_COLOR,
  },
  toggleButtonActiveWeight: {
    borderColor: WEIGHT_COLOR,
  },
  toggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toggleText: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#fff',
  },
  chartContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
    padding: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  statLabel: {
    color: '#888',
    fontSize: 13,
    fontFamily: 'Avenir Next',
  },
  statValue: {
    fontSize: 22,
    fontFamily: 'DIN Alternate',
    fontWeight: 'bold',
  },
});
