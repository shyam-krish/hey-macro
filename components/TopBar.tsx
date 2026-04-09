import { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TopBarProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  onCalendarPress: () => void;
  onTrendsPress: () => void;
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
  onTrendsPress,
  onProfilePress,
}: TopBarProps) {
  const todayStr = toDateString(new Date());
  const isToday = selectedDate === todayStr;
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const iconRef = useRef<View>(null);
  const pendingAction = useRef<(() => void) | null>(null);

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

  const handleMenuPress = () => {
    iconRef.current?.measureInWindow((_x, y, _width, height) => {
      setMenuPosition({ top: y + height + 4, right: 20 });
      setMenuVisible(true);
    });
  };

  const handleMenuItem = (action: () => void) => {
    pendingAction.current = action;
    setMenuVisible(false);
  };

  const handleMenuDismiss = () => {
    if (pendingAction.current) {
      pendingAction.current();
      pendingAction.current = null;
    }
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

      {/* Menu Icon */}
      <View ref={iconRef} collapsable={false}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={handleMenuPress}
          activeOpacity={0.7}
        >
          <Ionicons name="person-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Dropdown Menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
        onDismiss={handleMenuDismiss}
      >
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={styles.menuBackdrop}>
            <View style={[styles.menuContainer, { top: menuPosition.top, right: menuPosition.right }]}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleMenuItem(onTrendsPress)}
                activeOpacity={0.7}
              >
                <Ionicons name="trending-up-outline" size={16} color="#fff" />
                <Text style={styles.menuItemText}>Trends</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleMenuItem(onProfilePress)}
                activeOpacity={0.7}
              >
                <Ionicons name="person-outline" size={16} color="#fff" />
                <Text style={styles.menuItemText}>Profile</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  menuBackdrop: {
    flex: 1,
  },
  menuContainer: {
    position: 'absolute',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Avenir Next',
    fontWeight: '500',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#333',
    marginHorizontal: 12,
  },
});
