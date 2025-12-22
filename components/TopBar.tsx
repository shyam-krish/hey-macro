import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TopBarProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  onCalendarPress: () => void;
  onProfilePress: () => void;
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(dateStr: string): string {
  const today = new Date();
  const todayStr = toDateString(today);

  if (dateStr === todayStr) return 'Today';

  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

export function TopBar({
  selectedDate,
  onDateChange,
  onCalendarPress,
  onProfilePress,
}: TopBarProps) {
  const todayStr = toDateString(new Date());
  const isToday = selectedDate === todayStr;

  const handlePrevDay = () => {
    const date = parseLocalDate(selectedDate);
    date.setDate(date.getDate() - 1);
    onDateChange(toDateString(date));
  };

  const handleNextDay = () => {
    if (isToday) return;
    const date = parseLocalDate(selectedDate);
    date.setDate(date.getDate() + 1);
    onDateChange(toDateString(date));
  };

  return (
    <View style={styles.container}>
      {/* Calendar Icon */}
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onCalendarPress}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar-outline" size={18} color="#fff" />
      </TouchableOpacity>

      {/* Date Navigation */}
      <View style={styles.dateContainer}>
        <TouchableOpacity
          style={styles.arrowButton}
          onPress={handlePrevDay}
          activeOpacity={0.7}
        >
          <Text style={styles.arrow}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>

        <TouchableOpacity
          style={[styles.arrowButton, isToday && styles.arrowHidden]}
          onPress={handleNextDay}
          activeOpacity={0.7}
          disabled={isToday}
        >
          <Text style={[styles.arrow, isToday && styles.arrowHidden]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Profile Icon */}
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onProfilePress}
        activeOpacity={0.7}
      >
        <Ionicons name="person-outline" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#000',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  arrowButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    color: '#666',
    fontSize: 18,
    lineHeight: 20,
  },
  arrowHidden: {
    opacity: 0,
  },
  dateText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    fontWeight: '500',
    minWidth: 80,
    textAlign: 'center',
    lineHeight: 20,
  },
});
