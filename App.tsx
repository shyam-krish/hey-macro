import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { FoodEntry } from './types';
import { useAppData } from './hooks/useAppData';
import { useVoiceFoodLogger } from './hooks/useVoiceFoodLogger';
import { MealDetailSheet } from './components/MealDetailSheet';

// Calorie Ring Component
function CalorieRing({
  current,
  target,
  size = 120,
}: {
  current: number;
  target: number;
  size?: number;
}) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(current / target, 1);
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
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
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#34d399"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
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
}: {
  label: string;
  current: number;
  target: number;
}) {
  const progress = Math.min(current / target, 1);

  return (
    <View style={styles.progressBarContainer}>
      <View style={styles.progressBarHeader}>
        <Text style={styles.progressBarLabel}>{label}</Text>
        <Text style={styles.progressBarValue}>
          {current}/{target}
        </Text>
      </View>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
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

  if (entries.length === 0) {
    return null;
  }

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

export default function App() {
  const { targets, dailyLog, loading, error, refresh } = useAppData();
  const [selectedMeal, setSelectedMeal] = useState<{ title: string; type: MealType } | null>(null);
  const {
    isRecording,
    isProcessing,
    transcript,
    parsedFood,
    error: voiceError,
    startRecording,
    stopRecordingAndParse,
    saveParsedFood,
    reset,
  } = useVoiceFoodLogger();

  const handleMicPress = async () => {
    if (isRecording) {
      // Stop recording and parse with today's log for updates
      await stopRecordingAndParse({ todayLog: dailyLog ?? undefined });
    } else {
      // Start recording
      await startRecording();
    }
  };

  // Save parsed food to database when available
  useEffect(() => {
    if (!parsedFood || !dailyLog) return;

    let cancelled = false;

    (async () => {
      try {
        await saveParsedFood(dailyLog.dailyLogID, 'default-user');
        if (cancelled) return;
        reset();
        await refresh();
      } catch (err) {
        console.error('Error saving food:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parsedFood]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

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
          <>
            {/* Macro Summary Section */}
            <View style={styles.summarySection}>
              <CalorieRing
                current={dailyLog.totalCalories}
                target={targets.calories}
              />
              <View style={styles.macroProgressBars}>
                <MacroProgressBar
                  label="Protein"
                  current={dailyLog.totalProtein}
                  target={targets.protein}
                />
                <MacroProgressBar
                  label="Carbohydrates"
                  current={dailyLog.totalCarbs}
                  target={targets.carbs}
                />
                <MacroProgressBar
                  label="Fat"
                  current={dailyLog.totalFat}
                  target={targets.fat}
                />
              </View>
            </View>

            {/* Food Section */}
            <ScrollView style={styles.foodSection} contentContainerStyle={styles.foodSectionContent}>
              <Text style={styles.foodSectionTitle}>Food</Text>
              <MealCard
                title="Breakfast"
                entries={dailyLog.breakfast}
                onPress={() => setSelectedMeal({ title: 'Breakfast', type: 'breakfast' })}
              />
              <MealCard
                title="Lunch"
                entries={dailyLog.lunch}
                onPress={() => setSelectedMeal({ title: 'Lunch', type: 'lunch' })}
              />
              <MealCard
                title="Dinner"
                entries={dailyLog.dinner}
                onPress={() => setSelectedMeal({ title: 'Dinner', type: 'dinner' })}
              />
              <MealCard
                title="Snacks"
                entries={dailyLog.snacks}
                onPress={() => setSelectedMeal({ title: 'Snacks', type: 'snacks' })}
              />
              {/* Bottom padding for floating buttons */}
              <View style={{ height: 100 }} />
            </ScrollView>

            {/* Meal Detail Sheet */}
            {selectedMeal && (
              <MealDetailSheet
                visible={selectedMeal !== null}
                title={selectedMeal.title}
                entries={dailyLog[selectedMeal.type]}
                onClose={() => setSelectedMeal(null)}
              />
            )}

            {/* Floating Action Button */}
            <View style={styles.fabContainer}>
              <TouchableOpacity
                style={[
                  styles.fab,
                  isRecording && styles.fabRecording,
                  isProcessing && styles.fabProcessing,
                ]}
                onPress={handleMicPress}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="large" color="#fff" />
                ) : isRecording ? (
                  <View style={styles.stopIcon} />
                ) : (
                  <Image
                    source={require('./assets/mic.png')}
                    style={styles.micIcon}
                  />
                )}
              </TouchableOpacity>
            </View>

            {/* Voice Status Indicator */}
            {(isRecording || isProcessing || transcript) && (
              <View style={styles.voiceStatusContainer}>
                {isRecording && (
                  <Text style={styles.voiceStatusText}>🎙️ Listening...</Text>
                )}
                {isProcessing && (
                  <Text style={styles.voiceStatusText}>🤖 Analyzing...</Text>
                )}
                {transcript && !isProcessing && (
                  <Text style={styles.voiceTranscript}>"{transcript}"</Text>
                )}
                {voiceError && (
                  <Text style={styles.voiceErrorText}>❌ {voiceError}</Text>
                )}
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    paddingBottom: 10,
    alignItems: 'center',
    gap: 20,
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
  progressBarTrack: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#065f46',
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
    color: '#065f46',
  },

  // Floating Action Button
  fabContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: {
    width: 36,
    height: 36,
    tintColor: '#fff',
  },
  stopIcon: {
    width: 24,
    height: 24,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  fabRecording: {
    backgroundColor: '#ff4444',
    borderColor: '#ff6666',
  },
  fabProcessing: {
    backgroundColor: '#4444ff',
    borderColor: '#6666ff',
  },

  // Voice Status
  voiceStatusContainer: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  voiceStatusText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Avenir Next',
    textAlign: 'center',
  },
  voiceTranscript: {
    color: '#aaa',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  voiceErrorText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    textAlign: 'center',
  },
});
