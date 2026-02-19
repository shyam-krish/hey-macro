import { useEffect, useState, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  Keyboard,
  useWindowDimensions,
  AppState,
  AppStateStatus,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { useNavigation } from '@react-navigation/native';
import { FoodEntry, DailyLog } from '../types';
import { useAppDataContext } from '../contexts/AppDataContext';
import { useVoiceFoodLogger } from '../hooks/useVoiceFoodLogger';
import { parseFoodInput } from '../services/llm';
import { replaceDailyFoodEntries, getPreviousDaysLogs } from '../services/storage';
import { LLMResponse } from '../types';
import { MealDetailSheet } from '../components/MealDetailSheet';
import { TopBar } from '../components/TopBar';
import { CalendarDropdown } from '../components/CalendarDropdown';
import { HomeScreenNavigationProp } from '../navigation/types';

// Accent color
const ACCENT_COLOR = '#3FE0DB';

// Calorie Ring Component
function CalorieRing({
  current,
  target,
  size = 120,
  isToday = true,
  animatedProgress,
}: {
  current: number;
  target: number;
  size?: number;
  isToday?: boolean;
  animatedProgress?: Animated.Value;
}) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(current / target, 1);

  // Calculate ring color based on calorie difference
  const getCalorieRingColor = () => {
    const diff = current - target;

    if (isToday) {
      // Today: turquoise accent until 150+ over target, then dark red
      return diff > 150 ? '#991b1b' : ACCENT_COLOR;
    } else {
      // Past days: color based on how close to target
      const absDiff = Math.abs(diff);
      if (absDiff <= 150) return '#065f46'; // Dark green - nailed it
      if (absDiff <= 300) return '#92400e'; // Dark amber - close enough
      return '#991b1b'; // Dark red - significantly off
    }
  };

  const ringColor = getCalorieRingColor();

  // Use animated value if provided, otherwise static
  const strokeDashoffset = animatedProgress
    ? animatedProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [circumference, circumference * (1 - progress)],
      })
    : circumference * (1 - progress);

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#333"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle */}
        {animatedProgress ? (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        ) : (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset as number}
            strokeLinecap="round"
          />
        )}
      </Svg>
      <View style={styles.ringTextContainer}>
        <Text style={styles.ringCurrentText}>{current}</Text>
        <Text style={styles.ringTargetText}>/{target}</Text>
      </View>
    </View>
  );
}

// Progress Bar Component
function MacroProgressBar({
  label,
  current,
  target,
  animatedProgress,
}: {
  label: string;
  current: number;
  target: number;
  animatedProgress?: Animated.Value;
}) {
  const progress = Math.min(current / target, 1);
  const widthPercent = `${progress * 100}%` as const;

  // Animate width if animated value provided
  const animatedWidth = animatedProgress
    ? animatedProgress.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', widthPercent],
      })
    : null;

  return (
    <View style={styles.progressBarContainer}>
      <View style={styles.progressBarHeader}>
        <Text style={styles.progressBarLabel}>{label}</Text>
        <Text style={styles.progressBarValue}>
          <Text style={styles.progressBarCurrent}>{current}</Text>/{target}
        </Text>
      </View>
      <View style={styles.progressBarTrack}>
        {animatedWidth ? (
          <Animated.View style={[styles.progressBarFill, { width: animatedWidth }]} />
        ) : (
          <View style={[styles.progressBarFill, { width: widthPercent }]} />
        )}
      </View>
    </View>
  );
}

// Calculate meal totals
function getMealTotals(entries: FoodEntry[]) {
  return entries.reduce(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      carbs: acc.carbs + entry.carbs,
      fat: acc.fat + entry.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

// Rotating status messages for the analyzing phase
const ANALYZING_MESSAGES = [
  'Analyzing',
  'Calculating macros',
  'Looking up nutrition',
  'Crunching numbers',
  'Estimating portions',
];

// Animated Status Indicator Component
function StatusIndicator({
  isRecording,
  isProcessing,
  isSaving,
  error,
  inputText,
  onCancel,
  onDismissError,
}: {
  isRecording: boolean;
  isProcessing: boolean;
  isSaving: boolean;
  error: string | null;
  inputText?: string;
  onCancel?: () => void;
  onDismissError?: () => void;
}) {
  const dotOpacity1 = useRef(new Animated.Value(0.3)).current;
  const dotOpacity2 = useRef(new Animated.Value(0.3)).current;
  const dotOpacity3 = useRef(new Animated.Value(0.3)).current;
  const isActiveRef = useRef(false);
  const [messageIndex, setMessageIndex] = useState(0);

  // Track active state in ref to avoid stale closure
  useEffect(() => {
    isActiveRef.current = isRecording || isProcessing || isSaving;
  }, [isRecording, isProcessing, isSaving]);

  // Rotate through analyzing messages
  useEffect(() => {
    if (!isProcessing || isSaving) {
      setMessageIndex(0);
      return;
    }

    // Pick a random starting message (not always "Analyzing")
    const startIndex = Math.floor(Math.random() * ANALYZING_MESSAGES.length);
    setMessageIndex(startIndex);

    // Then rotate every 5 seconds
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % ANALYZING_MESSAGES.length);
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [isProcessing, isSaving]);

  // Animate dots in sequence
  useEffect(() => {
    if (!isRecording && !isProcessing && !isSaving) return;

    const animateDots = () => {
      // Reset all dots
      dotOpacity1.setValue(0.3);
      dotOpacity2.setValue(0.3);
      dotOpacity3.setValue(0.3);

      Animated.sequence([
        Animated.timing(dotOpacity1, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(dotOpacity2, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(dotOpacity3, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(200),
      ]).start(() => {
        // Use ref to check current state (avoids stale closure)
        if (isActiveRef.current) {
          animateDots();
        }
      });
    };

    animateDots();

    return () => {
      dotOpacity1.stopAnimation();
      dotOpacity2.stopAnimation();
      dotOpacity3.stopAnimation();
    };
  }, [isRecording, isProcessing, isSaving]);

  if (error) {
    return (
      <View style={[statusStyles.container, statusStyles.errorContainer]}>
        <Text style={statusStyles.errorText}>{error}</Text>
        {onDismissError && (
          <TouchableOpacity
            style={statusStyles.dismissButton}
            onPress={onDismissError}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={statusStyles.dismissButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Determine status text and color based on current state
  let statusText: string;
  let accentColor: string;

  if (isRecording) {
    statusText = 'Listening';
    accentColor = '#ff4444';
  } else if (isSaving) {
    statusText = 'Updating your macros';
    accentColor = ACCENT_COLOR;
  } else {
    statusText = ANALYZING_MESSAGES[messageIndex];
    accentColor = ACCENT_COLOR;
  }

  // Show cancel button only during processing (not recording or saving)
  const showCancel = isProcessing && !isRecording && !isSaving && !error && onCancel;

  return (
    <View
      style={[
        statusStyles.container,
        {
          borderColor: accentColor,
          shadowColor: accentColor,
        },
      ]}
    >
      <View style={statusStyles.textRow}>
        <Text key={statusText} style={statusStyles.text}>{statusText}</Text>
        <View style={statusStyles.dotsContainer}>
          <Animated.Text style={[statusStyles.dot, { opacity: dotOpacity1 }]}>.</Animated.Text>
          <Animated.Text style={[statusStyles.dot, { opacity: dotOpacity2 }]}>.</Animated.Text>
          <Animated.Text style={[statusStyles.dot, { opacity: dotOpacity3 }]}>.</Animated.Text>
        </View>
      </View>
      {/* Show input text when analyzing (not when saving) */}
      {isProcessing && !isSaving && inputText && (
        <Text style={statusStyles.inputText}>
          "{inputText}"
        </Text>
      )}
      {/* Cancel button in top right */}
      {showCancel && (
        <TouchableOpacity
          style={statusStyles.cancelButton}
          onPress={onCancel}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={statusStyles.cancelButtonText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const statusStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 70,
    left: 20,
    right: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    // Enhanced shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  errorContainer: {
    borderColor: '#ff6b6b',
    shadowColor: '#ff6b6b',
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Avenir Next',
    fontWeight: '500',
  },
  dotsContainer: {
    flexDirection: 'row',
    width: 24,
  },
  dot: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Avenir Next',
    fontWeight: '500',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 15,
    fontFamily: 'Avenir Next',
    textAlign: 'center',
  },
  inputText: {
    color: '#aaa',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  cancelButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 18,
  },
  dismissButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    color: '#ff6b6b',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 18,
  },
});

// iMessage-style Input Bar Component
function InputBar({
  textInput,
  onChangeText,
  isRecording,
  isProcessing,
  isTextProcessing,
  isSavingFood,
  onMicPress,
  onTextSubmit,
}: {
  textInput: string;
  onChangeText: (text: string) => void;
  isRecording: boolean;
  isProcessing: boolean;
  isTextProcessing: boolean;
  isSavingFood: boolean;
  onMicPress: () => void;
  onTextSubmit: () => void;
}) {
  const isBusy = isProcessing || isTextProcessing || isSavingFood;
  const hasText = textInput.trim().length > 0;

  const dotOpacity1 = useRef(new Animated.Value(0.3)).current;
  const dotOpacity2 = useRef(new Animated.Value(0.3)).current;
  const dotOpacity3 = useRef(new Animated.Value(0.3)).current;
  const isRecordingRef = useRef(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) {
      dotOpacity1.setValue(0.3);
      dotOpacity2.setValue(0.3);
      dotOpacity3.setValue(0.3);
      return;
    }

    const animateDots = () => {
      dotOpacity1.setValue(0.3);
      dotOpacity2.setValue(0.3);
      dotOpacity3.setValue(0.3);
      Animated.sequence([
        Animated.timing(dotOpacity1, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dotOpacity2, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dotOpacity3, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(200),
      ]).start(() => {
        if (isRecordingRef.current) animateDots();
      });
    };

    animateDots();

    return () => {
      dotOpacity1.stopAnimation();
      dotOpacity2.stopAnimation();
      dotOpacity3.stopAnimation();
    };
  }, [isRecording]);

  return (
    <View style={inputBarStyles.container}>
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={inputBarStyles.gradient}
        pointerEvents="none"
      />
      <View style={inputBarStyles.barRow}>
        {!isBusy && <View style={inputBarStyles.pill}>
          {isRecording ? (
            <View style={inputBarStyles.listeningRow}>
              <Text style={inputBarStyles.listeningText}>Listening</Text>
              <Animated.Text style={[inputBarStyles.listeningDot, { opacity: dotOpacity1 }]}>.</Animated.Text>
              <Animated.Text style={[inputBarStyles.listeningDot, { opacity: dotOpacity2 }]}>.</Animated.Text>
              <Animated.Text style={[inputBarStyles.listeningDot, { opacity: dotOpacity3 }]}>.</Animated.Text>
            </View>
          ) : (
            <TextInput
              style={inputBarStyles.textInput}
              placeholder="Log food or ask me anything"
              placeholderTextColor="#666"
              value={textInput}
              onChangeText={onChangeText}
              editable={!isBusy}
              multiline
              submitBehavior="blurAndSubmit"
              returnKeyType="send"
              onSubmitEditing={() => {
                if (hasText && !isBusy) onTextSubmit();
              }}
            />
          )}
          {isRecording ? (
            <TouchableOpacity style={inputBarStyles.stopButton} onPress={onMicPress}>
              <View style={inputBarStyles.stopIcon} />
            </TouchableOpacity>
          ) : hasText ? (
            <TouchableOpacity
              style={[inputBarStyles.sendButton, isBusy && { opacity: 0.5 }]}
              onPress={onTextSubmit}
              disabled={isBusy}
            >
              <Text style={inputBarStyles.sendArrow}>{'\u2191'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[inputBarStyles.micButton, isBusy && { opacity: 0.5 }]}
              onPress={onMicPress}
              disabled={isBusy}
            >
              <Image source={require('../assets/mic.png')} style={inputBarStyles.micIcon} />
            </TouchableOpacity>
          )}
        </View>}
      </View>
    </View>
  );
}

const inputBarStyles = StyleSheet.create({
  container: {
    // In normal flow at bottom of KeyboardAvoidingView
  },
  gradient: {
    position: 'absolute',
    top: -40,
    left: 0,
    right: 0,
    height: 40,
  },
  barRow: {
    backgroundColor: '#000',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 4 : 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 24,
    paddingLeft: 20,
    paddingRight: 10,
    paddingVertical: 6,
    gap: 10,
    minHeight: 48,
  },
  textInput: {
    flex: 1,
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Avenir Next',
    paddingVertical: 6,
    maxHeight: 120,
  },
  listeningRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  listeningText: {
    color: '#ff4444',
    fontSize: 17,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  listeningDot: {
    color: '#ff4444',
    fontSize: 17,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACCENT_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: {
    width: 20,
    height: 20,
    tintColor: '#000',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: ACCENT_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendArrow: {
    color: ACCENT_COLOR,
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: -2,
  },
  stopButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ff4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    width: 14,
    height: 14,
    backgroundColor: '#fff',
    borderRadius: 3,
  },
});

// Meal Card Component
function MealCard({
  title,
  entries,
  onPress,
}: {
  title: string;
  entries: FoodEntry[];
  onPress: () => void;
}) {
  const totals = getMealTotals(entries);

  return (
    <TouchableOpacity style={styles.mealCard} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.mealTitle}>{title}</Text>
      <View style={styles.mealContent}>
        <View style={styles.mealItems}>
          {entries.map((entry) => (
            <View key={entry.foodEntryID} style={styles.mealItemContainer}>
              <Text style={styles.mealItem}>{entry.name}</Text>
            </View>
          ))}
        </View>
        <View style={styles.mealTotals}>
          <Text style={styles.mealTotalText}>
            {totals.calories} <Text style={styles.mealTotalUnit}>cal</Text>
          </Text>
          <Text style={styles.mealTotalText}>
            {totals.protein}g <Text style={styles.mealTotalUnit}>P</Text>
          </Text>
          <Text style={styles.mealTotalText}>
            {totals.carbs}g <Text style={styles.mealTotalUnit}>C</Text>
          </Text>
          <Text style={styles.mealTotalText}>
            {totals.fat}g <Text style={styles.mealTotalUnit}>F</Text>
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { width: screenWidth } = useWindowDimensions();
  const { user, targets, dailyLog, loading, error, refresh, selectedDate, changeDate } =
    useAppDataContext();
  const [selectedMeal, setSelectedMeal] = useState<{ title: string; type: MealType } | null>(
    null
  );
  const [mealSheetVisible, setMealSheetVisible] = useState(false);
  // Keep track of last selected meal for rendering during close animation
  const lastSelectedMealRef = useRef<{ title: string; type: MealType } | null>(null);

  // Update ref when meal is selected
  useEffect(() => {
    if (selectedMeal) {
      lastSelectedMealRef.current = selectedMeal;
      setMealSheetVisible(true);
    }
  }, [selectedMeal]);

  const handleCloseMealSheet = () => {
    setMealSheetVisible(false);
  };

  const handleMealSheetClosed = () => {
    // Only clear selectedMeal after modal has fully animated out
    setSelectedMeal(null);
  };
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isTextProcessing, setIsTextProcessing] = useState(false);
  const [textParsedFood, setTextParsedFood] = useState<LLMResponse | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [previousDayLogs, setPreviousDayLogs] = useState<DailyLog[]>([]);
  const [isSavingFood, setIsSavingFood] = useState(false);
  const textCancelledRef = useRef(false);
  const textWasBackgroundedDuringProcessing = useRef(false);
  const {
    isRecording,
    isProcessing,
    transcript,
    parsedFood,
    error: voiceError,
    startRecording,
    stopRecordingAndParse,
    saveParsedFood,
    cancelProcessing,
    reset,
  } = useVoiceFoodLogger();

  // Animation values for macro summary
  const ringAnimProgress = useRef(new Animated.Value(0)).current;
  const proteinAnimProgress = useRef(new Animated.Value(0)).current;
  const carbsAnimProgress = useRef(new Animated.Value(0)).current;
  const fatAnimProgress = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const hasAnimatedOnStartup = useRef(false);
  const prevDateRef = useRef<string | null>(null);

  // Animation values for meal cards (staggered drop-down)
  const foodTitleAnim = useRef(new Animated.Value(0)).current;
  const breakfastAnim = useRef(new Animated.Value(0)).current;
  const lunchAnim = useRef(new Animated.Value(0)).current;
  const dinnerAnim = useRef(new Animated.Value(0)).current;
  const snacksAnim = useRef(new Animated.Value(0)).current;

  // Animated values for numbers
  const animatedCalories = useRef(new Animated.Value(0)).current;
  const animatedProtein = useRef(new Animated.Value(0)).current;
  const animatedCarbs = useRef(new Animated.Value(0)).current;
  const animatedFat = useRef(new Animated.Value(0)).current;

  // State for displaying animated numbers
  const [displayedCalories, setDisplayedCalories] = useState(0);
  const [displayedProtein, setDisplayedProtein] = useState(0);
  const [displayedCarbs, setDisplayedCarbs] = useState(0);
  const [displayedFat, setDisplayedFat] = useState(0);

  // Store old macro values for incremental animation
  const oldMacrosRef = useRef<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null>(null);

  // Set up listeners for animated numbers
  useEffect(() => {
    const caloriesListener = animatedCalories.addListener(({ value }) => {
      setDisplayedCalories(Math.round(value));
    });
    const proteinListener = animatedProtein.addListener(({ value }) => {
      setDisplayedProtein(Math.round(value));
    });
    const carbsListener = animatedCarbs.addListener(({ value }) => {
      setDisplayedCarbs(Math.round(value));
    });
    const fatListener = animatedFat.addListener(({ value }) => {
      setDisplayedFat(Math.round(value));
    });

    return () => {
      animatedCalories.removeListener(caloriesListener);
      animatedProtein.removeListener(proteinListener);
      animatedCarbs.removeListener(carbsListener);
      animatedFat.removeListener(fatListener);
    };
  }, []);

  // Animate slide and macro fill - only on initial app startup
  useEffect(() => {
    if (!dailyLog || loading) return;

    // Only animate on first load (app startup)
    if (hasAnimatedOnStartup.current) {
      // After startup, just show full values immediately
      ringAnimProgress.setValue(1);
      proteinAnimProgress.setValue(1);
      carbsAnimProgress.setValue(1);
      fatAnimProgress.setValue(1);
      animatedCalories.setValue(dailyLog.totalCalories);
      animatedProtein.setValue(dailyLog.totalProtein);
      animatedCarbs.setValue(dailyLog.totalCarbs);
      animatedFat.setValue(dailyLog.totalFat);
      // Show meal cards immediately
      foodTitleAnim.setValue(1);
      breakfastAnim.setValue(1);
      lunchAnim.setValue(1);
      dinnerAnim.setValue(1);
      snacksAnim.setValue(1);
      return;
    }

    // Mark that we've done the startup animation
    hasAnimatedOnStartup.current = true;

    // Check if viewing today
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isViewingToday = selectedDate === todayStr;

    // Determine slide direction based on date comparison
    const prevDate = prevDateRef.current;
    let direction: 'left' | 'right' | 'none' = 'none';

    if (prevDate && prevDate !== selectedDate) {
      // Compare dates to determine direction
      direction = selectedDate > prevDate ? 'left' : 'right';
    }

    // Update refs
    prevDateRef.current = selectedDate;

    // For past days, skip macro fill animations (show full values immediately)
    if (!isViewingToday) {
      ringAnimProgress.setValue(1);
      proteinAnimProgress.setValue(1);
      carbsAnimProgress.setValue(1);
      fatAnimProgress.setValue(1);
      animatedCalories.setValue(dailyLog.totalCalories);
      animatedProtein.setValue(dailyLog.totalProtein);
      animatedCarbs.setValue(dailyLog.totalCarbs);
      animatedFat.setValue(dailyLog.totalFat);
      // Show meal cards immediately for past days
      foodTitleAnim.setValue(1);
      breakfastAnim.setValue(1);
      lunchAnim.setValue(1);
      dinnerAnim.setValue(1);
      snacksAnim.setValue(1);

      // Still do slide animation if navigating between days
      if (direction !== 'none') {
        const startOffset = direction === 'left' ? screenWidth * 0.3 : -screenWidth * 0.3;
        slideAnim.setValue(startOffset);
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
      return;
    }

    // Reset macro animations for today
    ringAnimProgress.setValue(0);
    proteinAnimProgress.setValue(0);
    carbsAnimProgress.setValue(0);
    fatAnimProgress.setValue(0);
    animatedCalories.setValue(0);
    animatedProtein.setValue(0);
    animatedCarbs.setValue(0);
    animatedFat.setValue(0);
    // Reset meal card animations
    foodTitleAnim.setValue(0);
    breakfastAnim.setValue(0);
    lunchAnim.setValue(0);
    dinnerAnim.setValue(0);
    snacksAnim.setValue(0);

    if (direction !== 'none') {
      // Slide animation: start from off-screen, slide to center
      const startOffset = direction === 'left' ? screenWidth * 0.3 : -screenWidth * 0.3;
      slideAnim.setValue(startOffset);

      // Run slide and macro animations in parallel
      Animated.parallel([
        // Slide in
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // Macro fill sequence (slightly delayed)
        Animated.sequence([
          Animated.delay(150),
          Animated.parallel([
            Animated.timing(ringAnimProgress, {
              toValue: 1,
              duration: 600,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(animatedCalories, {
              toValue: dailyLog.totalCalories,
              duration: 600,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
          ]),
          Animated.parallel([
            Animated.timing(proteinAnimProgress, {
              toValue: 1,
              duration: 400,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(animatedProtein, {
              toValue: dailyLog.totalProtein,
              duration: 400,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(carbsAnimProgress, {
              toValue: 1,
              duration: 400,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(animatedCarbs, {
              toValue: dailyLog.totalCarbs,
              duration: 400,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(fatAnimProgress, {
              toValue: 1,
              duration: 400,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(animatedFat, {
              toValue: dailyLog.totalFat,
              duration: 400,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
          ]),
        ]),
      ]).start();
    } else {
      // No slide, just macro animations (initial load on today)
      // Then staggered meal card drop-down animations
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringAnimProgress, {
            toValue: 1,
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.timing(animatedCalories, {
            toValue: dailyLog.totalCalories,
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
        ]),
        Animated.parallel([
          Animated.timing(proteinAnimProgress, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.timing(animatedProtein, {
            toValue: dailyLog.totalProtein,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.timing(carbsAnimProgress, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.timing(animatedCarbs, {
            toValue: dailyLog.totalCarbs,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.timing(fatAnimProgress, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.timing(animatedFat, {
            toValue: dailyLog.totalFat,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
        ]),
        // Staggered meal card drop-down animations
        Animated.stagger(80, [
          Animated.timing(foodTitleAnim, {
            toValue: 1,
            duration: 350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(breakfastAnim, {
            toValue: 1,
            duration: 350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(lunchAnim, {
            toValue: 1,
            duration: 350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(dinnerAnim, {
            toValue: 1,
            duration: 350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(snacksAnim, {
            toValue: 1,
            duration: 350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [dailyLog, loading, selectedDate, screenWidth]);

  // Animate macros when dailyLog updates after saving food
  useEffect(() => {
    if (!dailyLog || !oldMacrosRef.current || !isSavingFood) return;

    // Check if the values have actually changed
    const hasChanged =
      oldMacrosRef.current.calories !== dailyLog.totalCalories ||
      oldMacrosRef.current.protein !== dailyLog.totalProtein ||
      oldMacrosRef.current.carbs !== dailyLog.totalCarbs ||
      oldMacrosRef.current.fat !== dailyLog.totalFat;

    if (!hasChanged) return;

    // Calculate old and new progress values for each macro
    const oldCalorieProgress = Math.min(
      oldMacrosRef.current.calories / dailyLog.targetCalories,
      1
    );
    const newCalorieProgress = Math.min(dailyLog.totalCalories / dailyLog.targetCalories, 1);

    const oldProteinProgress = Math.min(
      oldMacrosRef.current.protein / dailyLog.targetProtein,
      1
    );
    const newProteinProgress = Math.min(dailyLog.totalProtein / dailyLog.targetProtein, 1);

    const oldCarbsProgress = Math.min(oldMacrosRef.current.carbs / dailyLog.targetCarbs, 1);
    const newCarbsProgress = Math.min(dailyLog.totalCarbs / dailyLog.targetCarbs, 1);

    const oldFatProgress = Math.min(oldMacrosRef.current.fat / dailyLog.targetFat, 1);
    const newFatProgress = Math.min(dailyLog.totalFat / dailyLog.targetFat, 1);

    // Set to old progress values
    ringAnimProgress.setValue(oldCalorieProgress);
    proteinAnimProgress.setValue(oldProteinProgress);
    carbsAnimProgress.setValue(oldCarbsProgress);
    fatAnimProgress.setValue(oldFatProgress);
    animatedCalories.setValue(oldMacrosRef.current.calories);
    animatedProtein.setValue(oldMacrosRef.current.protein);
    animatedCarbs.setValue(oldMacrosRef.current.carbs);
    animatedFat.setValue(oldMacrosRef.current.fat);

    // Animate to new values
    Animated.parallel([
      Animated.timing(ringAnimProgress, {
        toValue: newCalorieProgress,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animatedCalories, {
        toValue: dailyLog.totalCalories,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(proteinAnimProgress, {
        toValue: newProteinProgress,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animatedProtein, {
        toValue: dailyLog.totalProtein,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(carbsAnimProgress, {
        toValue: newCarbsProgress,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animatedCarbs, {
        toValue: dailyLog.totalCarbs,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(fatAnimProgress, {
        toValue: newFatProgress,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animatedFat, {
        toValue: dailyLog.totalFat,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Animation complete, clear old values
      oldMacrosRef.current = null;
    });
  }, [dailyLog, isSavingFood]);

  // Fetch previous 7 days of logs for LLM context
  useEffect(() => {
    if (!user) return;

    getPreviousDaysLogs(user.userID, 7)
      .then(setPreviousDayLogs)
      .catch(() => {});
  }, [user]);

  // Monitor app state for text input processing
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      // If app is backgrounded while processing text input, mark it
      if (nextAppState === 'background' && isTextProcessing) {
        textWasBackgroundedDuringProcessing.current = true;
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isTextProcessing]);

  const handleMicPress = async () => {
    Keyboard.dismiss();
    if (isRecording) {
      // Stop recording and parse with today's log and previous days for context
      await stopRecordingAndParse({
        todayLog: dailyLog ?? undefined,
        previousDayLogs: previousDayLogs.length > 0 ? previousDayLogs : undefined,
      });
    } else {
      // Clear any typed text and start recording
      setTextInput('');
      await startRecording();
    }
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim() || !dailyLog) return;

    Keyboard.dismiss();
    textCancelledRef.current = false;
    setIsTextProcessing(true);
    setTextError(null);

    try {
      const result = await parseFoodInput({
        transcript: textInput.trim(),
        currentTime: new Date(),
        todayLog: dailyLog,
        previousDayLogs: previousDayLogs.length > 0 ? previousDayLogs : undefined,
      });

      // Check if cancelled before setting result
      if (!textCancelledRef.current) {
        setTextParsedFood(result);
        setTextInput('');
      }
    } catch (err) {
      if (!textCancelledRef.current) {
        // If app was backgrounded during processing, provide helpful context
        let errorMessage = err instanceof Error ? err.message : 'Failed to parse food input';
        if (textWasBackgroundedDuringProcessing.current) {
          errorMessage = 'Request failed because app was backgrounded. Keep the app open while processing.';
        }

        setTextError(errorMessage);
        textWasBackgroundedDuringProcessing.current = false;
      }
    } finally {
      if (!textCancelledRef.current) {
        setIsTextProcessing(false);
      }
    }
  };

  const handleCancelAnalysis = () => {
    // Only allow cancellation during processing/analyzing, not during recording or saving
    if (isRecording || isSavingFood) return;

    if (isProcessing) {
      cancelProcessing();
    }
    if (isTextProcessing) {
      textCancelledRef.current = true;
      setIsTextProcessing(false);
      setTextError(null);
    }
  };

  const handleDismissError = () => {
    reset(); // Clears voice errors
    setTextError(null); // Clears text errors
  };

  // Save parsed food from voice to database when available
  useEffect(() => {
    if (!parsedFood || !dailyLog) return;

    let cancelled = false;

    // Fail-safe: ensure loading state clears after max 10 seconds
    const failSafeTimeout = setTimeout(() => {
      setIsSavingFood(false);
    }, 10000);

    (async () => {
      try {
        // Show loading state
        setIsSavingFood(true);

        // Store current macro values for animation
        oldMacrosRef.current = {
          calories: dailyLog.totalCalories,
          protein: dailyLog.totalProtein,
          carbs: dailyLog.totalCarbs,
          fat: dailyLog.totalFat,
        };

        // Save the food
        await saveParsedFood(dailyLog.dailyLogID, 'default-user');
        if (cancelled) return;

        // Refresh data
        await refresh();
        if (cancelled) return;

        // Hide loading state (animation will trigger from separate useEffect)
        setIsSavingFood(false);

        // Reset after everything completes (avoid triggering effect cancellation)
        reset();
      } catch {
        setIsSavingFood(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(failSafeTimeout);
      setIsSavingFood(false);
    };
  }, [parsedFood]);

  // Save parsed food from text input to database when available
  useEffect(() => {
    if (!textParsedFood || !dailyLog) return;

    let cancelled = false;

    // Fail-safe: ensure loading state clears after max 10 seconds
    const failSafeTimeout = setTimeout(() => {
      setIsSavingFood(false);
    }, 10000);

    (async () => {
      try {
        // Show loading state
        setIsSavingFood(true);

        // Store current macro values for animation
        oldMacrosRef.current = {
          calories: dailyLog.totalCalories,
          protein: dailyLog.totalProtein,
          carbs: dailyLog.totalCarbs,
          fat: dailyLog.totalFat,
        };

        // Save the food
        await replaceDailyFoodEntries('default-user', dailyLog.dailyLogID, textParsedFood);
        if (cancelled) return;

        // Refresh data
        await refresh();
        if (cancelled) return;

        // Hide loading state (animation will trigger from separate useEffect)
        setIsSavingFood(false);

        // Reset after everything completes (avoid triggering effect cancellation)
        setTextParsedFood(null);
      } catch (err) {
        setTextError(err instanceof Error ? err.message : 'Failed to save food');
        setIsSavingFood(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(failSafeTimeout);
      setIsSavingFood(false);
    };
  }, [textParsedFood]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Top Bar with Calendar and Profile */}
      <TopBar
        selectedDate={selectedDate}
        onDateChange={changeDate}
        onCalendarPress={() => setCalendarVisible(true)}
        onProfilePress={() => navigation.navigate('Profile')}
      />

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
        <Animated.View style={[styles.mainContent, { transform: [{ translateX: slideAnim }] }]}>
          {/* Macro Summary Section */}
          <View style={styles.summarySection}>
            <CalorieRing
              current={displayedCalories}
              target={dailyLog.targetCalories}
              isToday={(() => {
                const now = new Date();
                const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                return selectedDate === localToday;
              })()}
              animatedProgress={ringAnimProgress}
            />
            <View style={styles.macroProgressBars}>
              <MacroProgressBar
                label="Protein"
                current={displayedProtein}
                target={dailyLog.targetProtein}
                animatedProgress={proteinAnimProgress}
              />
              <MacroProgressBar
                label="Carbohydrates"
                current={displayedCarbs}
                target={dailyLog.targetCarbs}
                animatedProgress={carbsAnimProgress}
              />
              <MacroProgressBar
                label="Fat"
                current={displayedFat}
                target={dailyLog.targetFat}
                animatedProgress={fatAnimProgress}
              />
            </View>
          </View>

          {/* Food Section */}
          <View style={{ flex: 1, position: 'relative' }}>
            {(() => {
              const hasFood =
                dailyLog.breakfast.length > 0 ||
                dailyLog.lunch.length > 0 ||
                dailyLog.dinner.length > 0 ||
                dailyLog.snacks.length > 0;

              // Helper function to create animated style for meal cards
              const getMealAnimStyle = (animValue: Animated.Value) => ({
                opacity: animValue,
                transform: [{
                  translateY: animValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                }],
              });

              const content = (
                <>
                  <Animated.Text
                    style={[
                      styles.foodSectionTitle,
                      {
                        opacity: foodTitleAnim,
                        transform: [{
                          translateY: foodTitleAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-20, 0],
                          }),
                        }],
                      },
                    ]}
                  >
                    Food
                  </Animated.Text>
                  {hasFood ? (
                    <>
                      {dailyLog.breakfast.length > 0 && (
                        <Animated.View style={getMealAnimStyle(breakfastAnim)}>
                          <MealCard
                            title="Breakfast"
                            entries={dailyLog.breakfast}
                            onPress={() => setSelectedMeal({ title: 'Breakfast', type: 'breakfast' })}
                          />
                        </Animated.View>
                      )}
                      {dailyLog.lunch.length > 0 && (
                        <Animated.View style={getMealAnimStyle(lunchAnim)}>
                          <MealCard
                            title="Lunch"
                            entries={dailyLog.lunch}
                            onPress={() => setSelectedMeal({ title: 'Lunch', type: 'lunch' })}
                          />
                        </Animated.View>
                      )}
                      {dailyLog.dinner.length > 0 && (
                        <Animated.View style={getMealAnimStyle(dinnerAnim)}>
                          <MealCard
                            title="Dinner"
                            entries={dailyLog.dinner}
                            onPress={() => setSelectedMeal({ title: 'Dinner', type: 'dinner' })}
                          />
                        </Animated.View>
                      )}
                      {dailyLog.snacks.length > 0 && (
                        <Animated.View style={getMealAnimStyle(snacksAnim)}>
                          <MealCard
                            title="Snacks"
                            entries={dailyLog.snacks}
                            onPress={() => setSelectedMeal({ title: 'Snacks', type: 'snacks' })}
                          />
                        </Animated.View>
                      )}
                      {/* Bottom padding */}
                      <View style={{ height: 20 }} />
                    </>
                  ) : (
                    <Animated.View
                      style={[
                        styles.emptyStateContainer,
                        getMealAnimStyle(breakfastAnim),
                      ]}
                    >
                      <Text style={styles.emptyStateText}>No food logged yet</Text>
                      <Text style={styles.emptyStateSubtext}>
                        Use the input below to get started
                      </Text>
                    </Animated.View>
                  )}
                </>
              );

              return hasFood ? (
                <ScrollView style={styles.foodSection} contentContainerStyle={styles.foodSectionContent} keyboardDismissMode="on-drag">
                  {content}
                </ScrollView>
              ) : (
                <View style={[styles.foodSection, styles.foodSectionContent]}>{content}</View>
              );
            })()}

          </View>
        </Animated.View>

          {/* Status Indicator (renders on top) */}
          {(isProcessing || isTextProcessing || isSavingFood || voiceError || textError) && (
            <StatusIndicator
              isRecording={isRecording}
              isProcessing={isProcessing || isTextProcessing}
              isSaving={isSavingFood}
              error={voiceError || textError}
              inputText={isProcessing ? transcript : isTextProcessing ? textInput : undefined}
              onCancel={handleCancelAnalysis}
              onDismissError={handleDismissError}
            />
          )}

          {/* iMessage-style Input Bar */}
          <InputBar
            textInput={textInput}
            onChangeText={setTextInput}
            isRecording={isRecording}
            isProcessing={isProcessing}
            isTextProcessing={isTextProcessing}
            isSavingFood={isSavingFood}
            onMicPress={handleMicPress}
            onTextSubmit={handleTextSubmit}
          />
        </KeyboardAvoidingView>
      )}

      {/* Calendar Dropdown */}
      <CalendarDropdown
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        selectedDate={selectedDate}
        onDateSelect={(date) => {
          changeDate(date);
          setCalendarVisible(false);
        }}
        userID={user?.userID || 'default-user'}
        calorieTarget={targets?.calories || 2700}
      />

      {/* Modals rendered outside loading conditional to prevent unmount during refresh */}
      <MealDetailSheet
        visible={mealSheetVisible}
        title={lastSelectedMealRef.current?.title ?? ''}
        entries={lastSelectedMealRef.current && dailyLog ? dailyLog[lastSelectedMealRef.current.type] : []}
        onClose={handleCloseMealSheet}
        onUpdate={refresh}
        onModalHide={handleMealSheetClosed}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  mainContent: {
    flex: 1,
  },

  // Loading/Error States
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
    fontFamily: 'Avenir Next',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
    fontFamily: 'Avenir Next',
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  // Summary Section
  summarySection: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },

  // Calorie Ring
  ringTextContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringCurrentText: {
    color: '#fff',
    fontSize: 28,
    fontFamily: 'DIN Alternate',
    fontWeight: 'bold',
  },
  ringTargetText: {
    color: '#888',
    fontSize: 14,
    fontFamily: 'DIN Alternate',
  },

  // Macro Progress Bars
  macroProgressBars: {
    flex: 1,
    gap: 12,
  },
  progressBarContainer: {
    gap: 4,
  },
  progressBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressBarLabel: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Avenir Next',
  },
  progressBarValue: {
    color: '#888',
    fontSize: 14,
    fontFamily: 'DIN Alternate',
  },
  progressBarCurrent: {
    color: '#fff',
    fontWeight: 'bold',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 4,
  },

  // Food Section
  foodSection: {
    flex: 1,
  },
  foodSectionContent: {
    paddingHorizontal: 20,
  },
  foodSectionTitle: {
    color: '#fff',
    fontSize: 28,
    fontFamily: 'Avenir Next',
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 15,
  },

  // Meal Card
  mealCard: {
    marginBottom: 15,
  },
  mealTitle: {
    color: '#888',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    marginBottom: 8,
  },
  mealContent: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  mealItems: {
    flex: 1,
    gap: 8,
    padding: 15,
  },
  mealItemContainer: {
    borderLeftWidth: 2,
    borderLeftColor: '#666',
    paddingLeft: 12,
  },
  mealItem: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Avenir Next',
  },
  mealTotals: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: '#252525',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  mealTotalText: {
    color: '#888',
    fontSize: 16,
    fontFamily: 'DIN Alternate',
  },
  mealTotalUnit: {
    color: '#a3a3a3',
  },

  // Empty State
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyStateText: {
    color: '#666',
    fontSize: 18,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  emptyStateSubtext: {
    color: '#444',
    fontSize: 14,
    fontFamily: 'Avenir Next',
  },
});
