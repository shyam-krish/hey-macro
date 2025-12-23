import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { DateCalorieData } from '../types';
import { getMonthCalorieData } from '../services/storage';

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
      // Today: neutral until 150+ over target, then dark red
      return diff > 150 ? '#991b1b' : '#a3a3a3';
    } else {
      // Past days: color based on how close to target (dark shades)
      const absDiff = Math.abs(diff);
      if (absDiff <= 150) return '#065f46'; // Dark green - nailed it
      if (absDiff <= 300) return '#92400e'; // Dark amber - close enough
      return '#991b1b'; // Dark red - significantly off
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
): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = lastDay.getDate();

  const today = new Date().toISOString().split('T')[0];
  const days: CalendarDay[] = [];

  // Add padding days from previous month
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNumber = prevMonthLastDay - i;
    const date = new Date(year, month - 1, dayNumber).toISOString().split('T')[0];
    days.push({
      date,
      dayNumber,
      isCurrentMonth: false,
      isToday: date === today,
      isSelected: date === selectedDate,
      calories: 0,
      calorieTarget: 0,
    });
  }

  // Add days of current month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day).toISOString().split('T')[0];
    const calorieInfo = calorieData.get(date);
    days.push({
      date,
      dayNumber: day,
      isCurrentMonth: true,
      isToday: date === today,
      isSelected: date === selectedDate,
      calories: calorieInfo?.calories || 0,
      calorieTarget: calorieInfo?.calorieTarget || 2700,
    });
  }

  // Add padding days from next month
  const remainingDays = 42 - days.length; // 6 rows × 7 days
  for (let day = 1; day <= remainingDays; day++) {
    const date = new Date(year, month + 1, day).toISOString().split('T')[0];
    days.push({
      date,
      dayNumber: day,
      isCurrentMonth: false,
      isToday: date === today,
      isSelected: date === selectedDate,
      calories: 0,
      calorieTarget: 0,
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

  // Initialize displayed month from selected date when visible
  useEffect(() => {
    if (visible && selectedDate) {
      const date = new Date(selectedDate);
      setDisplayedYear(date.getFullYear());
      setDisplayedMonth(date.getMonth());
    }
  }, [visible, selectedDate]);

  // Fetch calorie data for the displayed month
  useEffect(() => {
    if (!visible) return;

    const fetchCalorieData = async () => {
      try {
        setLoading(true);
        const data = await getMonthCalorieData(userID, displayedYear, displayedMonth);
        const dataMap = new Map(data.map((d) => [d.date, d]));
        setCalorieData(dataMap);
      } catch (error) {
        console.error('Failed to fetch month calorie data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCalorieData();
  }, [visible, userID, displayedYear, displayedMonth]);

  const handlePrevMonth = () => {
    const newDate = new Date(displayedYear, displayedMonth - 1, 1);
    setDisplayedYear(newDate.getFullYear());
    setDisplayedMonth(newDate.getMonth());
  };

  const handleNextMonth = () => {
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
              activeOpacity={0.7}
            >
              <Text style={styles.monthNavArrow}>‹</Text>
            </TouchableOpacity>

            <Text style={styles.monthTitle}>
              {monthNames[displayedMonth]} {displayedYear}
            </Text>

            <TouchableOpacity
              style={styles.monthNavButton}
              onPress={handleNextMonth}
              activeOpacity={0.7}
            >
              <Text style={styles.monthNavArrow}>›</Text>
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
          <ScrollView
            style={styles.calendarScroll}
            contentContainerStyle={styles.calendarGrid}
            showsVerticalScrollIndicator={false}
          >
            {calendarDays.map((day, index) => (
              <TouchableOpacity
                key={`${day.date}-${index}`}
                style={[
                  styles.dayCell,
                  day.isSelected && styles.dayCellSelected,
                  day.isToday && !day.isSelected && styles.dayCellToday,
                ]}
                onPress={() => {
                  onDateSelect(day.date);
                }}
                activeOpacity={0.7}
              >
                {day.isCurrentMonth && day.calories > 0 && (
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
                    !day.isCurrentMonth && styles.dayNumberGrayed,
                    day.isSelected && styles.dayNumberSelected,
                    day.isToday && !day.isSelected && styles.dayNumberToday,
                  ]}
                >
                  {day.dayNumber}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
  calendarScroll: {
    maxHeight: 320,
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
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
  },
  dayNumber: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'DIN Alternate',
    fontWeight: '500',
    zIndex: 1,
  },
  dayNumberGrayed: {
    color: '#333',
  },
  dayNumberSelected: {
    color: '#fff',
  },
  dayNumberToday: {
    color: '#fff',
  },
});
