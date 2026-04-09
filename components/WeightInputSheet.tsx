import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';

const ACCENT_COLOR = '#3FE0DB';
const SCREEN_HEIGHT = Dimensions.get('window').height;

interface WeightInputSheetProps {
  visible: boolean;
  onClose: () => void;
  onSave: (weight: number) => void;
  currentWeight: number | null; // today's logged weight (for editing)
  previousWeight: number | null; // yesterday's weight (for reference/pre-fill)
}

const NUM_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

export function WeightInputSheet({
  visible,
  onClose,
  onSave,
  currentWeight,
  previousWeight,
}: WeightInputSheetProps) {
  const [slideAnim] = useState(() => new Animated.Value(SCREEN_HEIGHT));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [input, setInput] = useState('');

  // Pre-fill when sheet opens
  useEffect(() => {
    if (visible) {
      if (currentWeight !== null) {
        setInput(String(currentWeight));
      } else if (previousWeight !== null) {
        setInput(String(previousWeight));
      } else {
        setInput('');
      }

      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleKeyPress = (key: string) => {
    if (key === 'del') {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    if (key === '.') {
      if (input.includes('.')) return; // only one decimal
      if (input === '') {
        setInput('0.');
        return;
      }
    }

    // Limit to one decimal place
    const decimalIndex = input.indexOf('.');
    if (decimalIndex !== -1 && input.length - decimalIndex > 1) return;

    // Limit total length to prevent absurd values
    if (input.replace('.', '').length >= 5) return;

    setInput((prev) => prev + key);
  };

  const handleSave = () => {
    const weight = parseFloat(input);
    if (isNaN(weight) || weight <= 0) return;
    onSave(weight);
    onClose();
  };

  const isValidWeight = (() => {
    const weight = parseFloat(input);
    return !isNaN(weight) && weight > 0;
  })();

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={sheetStyles.overlay}>
        <Animated.View
          style={[sheetStyles.backdrop, { opacity: backdropOpacity }]}
        >
          <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        </Animated.View>
        <Animated.View
          style={[sheetStyles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          <View style={sheetStyles.handle} />

          <Text style={sheetStyles.title}>Log Weight</Text>

          {/* Weight display */}
          <View style={sheetStyles.displayContainer}>
            <Text style={[sheetStyles.displayText, !input && sheetStyles.displayPlaceholder]}>
              {input || '0.0'}
            </Text>
            <Text style={sheetStyles.unitText}>lbs</Text>
          </View>

          {/* Yesterday's reference */}
          {previousWeight !== null && (
            <Text style={sheetStyles.referenceText}>
              Previous: {previousWeight} lbs
            </Text>
          )}

          {/* Save button */}
          <TouchableOpacity
            style={[sheetStyles.saveButton, !isValidWeight && sheetStyles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!isValidWeight}
          >
            <Text style={[sheetStyles.saveButtonText, !isValidWeight && sheetStyles.saveButtonTextDisabled]}>
              Save
            </Text>
          </TouchableOpacity>

          {/* Number pad */}
          <View style={sheetStyles.numPad}>
            {NUM_KEYS.map((key) => (
              <TouchableOpacity
                key={key}
                style={sheetStyles.numKey}
                onPress={() => handleKeyPress(key)}
                activeOpacity={0.5}
              >
                <Text style={sheetStyles.numKeyText}>
                  {key === 'del' ? '\u232B' : key}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  displayContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 8,
  },
  displayText: {
    color: '#fff',
    fontSize: 48,
    fontFamily: 'DIN Alternate',
    fontWeight: 'bold',
  },
  displayPlaceholder: {
    color: '#555',
  },
  unitText: {
    color: '#888',
    fontSize: 20,
    fontFamily: 'Avenir Next',
    marginLeft: 8,
  },
  referenceText: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    textAlign: 'center',
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: ACCENT_COLOR,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  saveButtonDisabled: {
    backgroundColor: '#333',
  },
  saveButtonText: {
    color: '#000',
    fontSize: 17,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    color: '#666',
  },
  numPad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  numKey: {
    width: '33.33%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  numKeyText: {
    color: '#fff',
    fontSize: 28,
    fontFamily: 'DIN Alternate',
  },
});
