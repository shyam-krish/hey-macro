import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { DateCalorieData } from '../types';
import { getMonthCalorieData, getEarliestLogDate } from '../services/storage';

// Accent color
const ACCENT_COLOR = '#3FE0DB';

interface CalendarDropdownProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string;
  onDateSelect: (date: string) => void;
  userID: string;
  calorieTarget: number;
}

interface CalendarDay {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isFuture: boolean;
  calories: number;
  calorieTarget: number;
}

function CalorieRing({
  calories,
  target,
  size = 32,
  isToday = false,
}: {
  calories: number;
  target: number;
  size?: number;
  isToday?: boolean;
}) {
  const radius = (size - 4) / 2;
  const strokeWidth = 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(calories / target, 1);
  const strokeDashoffset = circumference * (1 - progress);

  // Calculate ring color based on calorie difference
  const getCalorieRingColor = () => {
    const diff = calories - target;

    if (isToday) {
      // Today: turquoise accent until 150+ over target, then dark red
      return diff > 150 ? '#991b1b' : ACCENT_COLOR;
    } else {
      // Past days: color based on difference from target
      if (diff < 0) {
        // Under target: white
        return '#ffffff';
      } else {
        // Over target: green/amber/red based on how much over
        if (diff <= 150) return '#065f46'; // Dark green - nailed it
        if (diff <= 300) return '#92400e'; // Dark amber - close enough
        return '#991b1b'; // Dark red - significantly over
      }
    }
  };

  const ringColor = getCalorieRingColor();

  return (
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      {/* Background circle */}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#222"
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Progress circle */}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={ringColor}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

function generateCalendarDays(
  year: number,
  month: number, // 0-indexed
  selectedDate: string,
  calorieData: Map<string, DateCalorieData>
): (CalendarDay | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = lastDay.getDate();

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const days: (CalendarDay | null)[] = [];

  // Add empty placeholders for days before the first of the month
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }

  // Add days of current month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const calorieInfo = calorieData.get(date);
    days.push({
      date,
      dayNumber: day,
      isCurrentMonth: true,
      isToday: date === today,
      isSelected: date === selectedDate,
      isFuture: date > today,
      calories: calorieInfo?.calories || 0,
      calorieTarget: calorieInfo?.calorieTarget || 2700,
    });
  }

  return days;
}

export function CalendarDropdown({
  visible,
  onClose,
  selectedDate,
  onDateSelect,
  userID,
  calorieTarget,
}: CalendarDropdownProps) {
  const [displayedYear, setDisplayedYear] = useState(new Date().getFullYear());
  const [displayedMonth, setDisplayedMonth] = useState(new Date().getMonth());
  const [calorieData, setCalorieData] = useState<Map<string, DateCalorieData>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const [earliestDate, setEarliestDate] = useState<string | null>(null);

  // Initialize displayed month from selected date when visible
  useEffect(() => {
    if (visible && selectedDate) {
      const date = new Date(selectedDate);
      setDisplayedYear(date.getFullYear());
      setDisplayedMonth(date.getMonth());
    }
  }, [visible, selectedDate]);

  // Fetch earliest date with data
  useEffect(() => {
    if (!visible) return;

    const fetchEarliestDate = async () => {
      try {
        const date = await getEarliestLogDate(userID);
        setEarliestDate(date);
      } catch {
        // Silently fail - calendar will still work without earliest date
      }
    };

    fetchEarliestDate();
  }, [visible, userID]);

  // Fetch calorie data for the displayed month
  useEffect(() => {
    if (!visible) return;

    const fetchCalorieData = async () => {
      try {
        setLoading(true);
        const data = await getMonthCalorieData(userID, displayedYear, displayedMonth);
        const dataMap = new Map(data.map((d) => [d.date, d]));
        setCalorieData(dataMap);
      } catch {
        // Silently fail - calendar will render without calorie data
      } finally {
        setLoading(false);
      }
    };

    fetchCalorieData();
  }, [visible, userID, displayedYear, displayedMonth]);

  // Check if we can navigate to previous month (must have data)
  const canGoPrevMonth = () => {
    if (!earliestDate) return false;
    const earliestParsed = new Date(earliestDate);
    const earliestYear = earliestParsed.getFullYear();
    const earliestMonth = earliestParsed.getMonth();
    // Can go back if we're after the earliest month
    return displayedYear > earliestYear ||
      (displayedYear === earliestYear && displayedMonth > earliestMonth);
  };

  // Check if we can navigate to next month (can't go past current month)
  const canGoNextMonth = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    return displayedYear < currentYear ||
      (displayedYear === currentYear && displayedMonth < currentMonth);
  };

  const handlePrevMonth = () => {
    if (!canGoPrevMonth()) return;
    const newDate = new Date(displayedYear, displayedMonth - 1, 1);
    setDisplayedYear(newDate.getFullYear());
    setDisplayedMonth(newDate.getMonth());
  };

  const handleNextMonth = () => {
    if (!canGoNextMonth()) return;
    const newDate = new Date(displayedYear, displayedMonth + 1, 1);
    setDisplayedYear(newDate.getFullYear());
    setDisplayedMonth(newDate.getMonth());
  };

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const calendarDays = generateCalendarDays(
    displayedYear,
    displayedMonth,
    selectedDate,
    calorieData
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Top bar spacer - keeps space for the actual top bar */}
        <View style={styles.topBarSpacer} />

        <Pressable style={styles.calendarContainer} onPress={(e) => e.stopPropagation()}>
          {/* Month/Year Header with Navigation */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.monthNavButton}
              onPress={handlePrevMonth}
              activeOpacity={canGoPrevMonth() ? 0.7 : 1}
              disabled={!canGoPrevMonth()}
            >
              <Text style={[styles.monthNavArrow, !canGoPrevMonth() && styles.monthNavArrowDisabled]}>‹</Text>
            </TouchableOpacity>

            <Text style={styles.monthTitle}>
              {monthNames[displayedMonth]} {displayedYear}
            </Text>

            <TouchableOpacity
              style={styles.monthNavButton}
              onPress={handleNextMonth}
              activeOpacity={canGoNextMonth() ? 0.7 : 1}
              disabled={!canGoNextMonth()}
            >
              <Text style={[styles.monthNavArrow, !canGoNextMonth() && styles.monthNavArrowDisabled]}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Week Day Labels */}
          <View style={styles.weekDaysRow}>
            {weekDays.map((day) => (
              <View key={day} style={styles.weekDayCell}>
                <Text style={styles.weekDayLabel}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((day, index) => {
              // Empty placeholder for days before the first of month
              if (day === null) {
                return <View key={`empty-${index}`} style={styles.dayCell} />;
              }

              const isDisabled = day.isFuture;

              return (
                <TouchableOpacity
                  key={`${day.date}-${index}`}
                  style={[
                    styles.dayCell,
                    day.isSelected && styles.dayCellSelected,
                    day.isToday && !day.isSelected && styles.dayCellToday,
                  ]}
                  onPress={() => {
                    if (!isDisabled) {
                      onDateSelect(day.date);
                    }
                  }}
                  activeOpacity={isDisabled ? 1 : 0.7}
                  disabled={isDisabled}
                >
                  {day.calories > 0 && (
                    <CalorieRing
                      calories={day.calories}
                      target={day.calorieTarget}
                      size={32}
                      isToday={day.isToday}
                    />
                  )}
                  <Text
                    style={[
                      styles.dayNumber,
                      isDisabled && styles.dayNumberDisabled,
                      day.isSelected && styles.dayNumberSelected,
                      day.isToday && !day.isSelected && styles.dayNumberToday,
                    ]}
                  >
                    {day.dayNumber}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  topBarSpacer: {
    height: 100, // Space for status bar + top bar
  },
  calendarContainer: {
    backgroundColor: '#000',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  monthNavButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthNavArrow: {
    color: '#666',
    fontSize: 20,
    fontFamily: 'Avenir Next',
    fontWeight: '300',
  },
  monthNavArrowDisabled: {
    color: '#222',
  },
  monthTitle: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Avenir Next',
    fontWeight: '500',
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekDayLabel: {
    color: '#444',
    fontSize: 10,
    fontFamily: 'Avenir Next',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%', // 100% / 7 days
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 4,
  },
  dayCellSelected: {
    backgroundColor: '#333',
    borderRadius: 16,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: ACCENT_COLOR,
    borderRadius: 16,
  },
  dayNumber: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'DIN Alternate',
    fontWeight: '500',
    zIndex: 1,
  },
  dayNumberDisabled: {
    color: '#333',
  },
  dayNumberSelected: {
    color: '#fff',
  },
  dayNumberToday: {
    color: ACCENT_COLOR,
  },
});
