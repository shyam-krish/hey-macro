import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppDataContext } from '../contexts/AppDataContext';
import { useMacroCalculator } from '../hooks/useMacroCalculator';
import { ProfileScreenNavigationProp } from '../navigation/types';

export function ProfileScreen() {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { user, targets, updateTargets, updateUser } = useAppDataContext();
  const [isEditingMacros, setIsEditingMacros] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const calculator = useMacroCalculator(targets);

  // Initialize name fields when user data loads
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
    }
  }, [user]);

  const handleEditUser = () => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
    }
    setIsEditingUser(true);
  };

  const handleCancelUser = () => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
    }
    setIsEditingUser(false);
  };

  const handleSaveUser = async () => {
    if (!user || !firstName.trim() || !lastName.trim()) return;

    setIsSaving(true);
    try {
      await updateUser({
        userID: user.userID,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setIsEditingUser(false);
    } catch (err) {
      console.error('Failed to save user:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditMacros = () => {
    calculator.reset(targets);
    setIsEditingMacros(true);
  };

  const handleCancelMacros = () => {
    calculator.reset(targets);
    setIsEditingMacros(false);
  };

  const handleSaveMacros = async () => {
    const finalValues = calculator.getFinalValues();
    if (!finalValues) return;

    setIsSaving(true);
    try {
      await updateTargets({
        userID: targets.userID,
        ...finalValues,
      });
      setIsEditingMacros(false);
    } catch (err) {
      console.error('Failed to save targets:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const renderMacroRow = (
    label: string,
    field: 'calories' | 'protein' | 'carbs' | 'fat',
    unit: string = ''
  ) => {
    const value = calculator.values[field];
    const isCalculated = calculator.calculatedField === field;

    const setters = {
      calories: calculator.setCalories,
      protein: calculator.setProtein,
      carbs: calculator.setCarbs,
      fat: calculator.setFat,
    };

    if (!isEditingMacros) {
      return (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue}>
            {targets[field]}
            {unit}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.inputRow}>
        <Text style={styles.inputLabel}>{label}</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              isCalculated && styles.inputCalculated,
            ]}
            value={value}
            onChangeText={setters[field]}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#555"
            selectTextOnFocus
          />
          {unit && <Text style={styles.inputUnit}>{unit}</Text>}
          {isCalculated && (
            <View style={styles.calculatedBadge}>
              <Text style={styles.calculatedBadgeText}>auto</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* User Info */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>USER</Text>
              {!isEditingUser && (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={handleEditUser}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            {!isEditingUser ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name</Text>
                <Text style={styles.infoValue}>
                  {user ? `${user.firstName} ${user.lastName}` : 'Loading...'}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.inputRow}>
                  <Text style={styles.inputLabel}>First Name</Text>
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First Name"
                    placeholderTextColor="#555"
                    selectTextOnFocus
                  />
                </View>
                <View style={styles.inputRow}>
                  <Text style={styles.inputLabel}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last Name"
                    placeholderTextColor="#555"
                    selectTextOnFocus
                  />
                </View>
              </>
            )}
          </View>

          {/* Macro Targets */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>MACRO TARGETS</Text>
              {!isEditingMacros && (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={handleEditMacros}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            {isEditingMacros && (
              <View style={styles.hintContainer}>
                <Text style={styles.hintText}>
                  Set any 3 values and the 4th will auto-calculate
                </Text>
              </View>
            )}

            {renderMacroRow('Calories', 'calories')}
            {renderMacroRow('Protein', 'protein', 'g')}
            {renderMacroRow('Carbs', 'carbs', 'g')}
            {renderMacroRow('Fat', 'fat', 'g')}

            {calculator.error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{calculator.error}</Text>
              </View>
            )}
          </View>

          {/* Formula Reference */}
          {isEditingMacros && (
            <View style={styles.formulaSection}>
              <Text style={styles.formulaTitle}>Caloric Values</Text>
              <Text style={styles.formulaText}>1g Protein = 4 calories</Text>
              <Text style={styles.formulaText}>1g Carbs = 4 calories</Text>
              <Text style={styles.formulaText}>1g Fat = 9 calories</Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom Buttons (Edit Mode for User) */}
        {isEditingUser && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelUser}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveButton,
                (!firstName.trim() || !lastName.trim() || isSaving) && styles.saveButtonDisabled,
              ]}
              onPress={handleSaveUser}
              activeOpacity={0.7}
              disabled={!firstName.trim() || !lastName.trim() || isSaving}
            >
              <Text
                style={[
                  styles.saveButtonText,
                  (!firstName.trim() || !lastName.trim() || isSaving) && styles.saveButtonTextDisabled,
                ]}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Buttons (Edit Mode for Macros) */}
        {isEditingMacros && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelMacros}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveButton,
                (!calculator.isValid || isSaving) && styles.saveButtonDisabled,
              ]}
              onPress={handleSaveMacros}
              activeOpacity={0.7}
              disabled={!calculator.isValid || isSaving}
            >
              <Text
                style={[
                  styles.saveButtonText,
                  (!calculator.isValid || isSaving) && styles.saveButtonTextDisabled,
                ]}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  keyboardView: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 100,
  },

  // Section
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  editButtonText: {
    color: '#000',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },

  // Info Row (View Mode)
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  infoLabel: {
    color: '#888',
    fontSize: 16,
    fontFamily: 'Avenir Next',
  },
  infoValue: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'DIN Alternate',
    fontWeight: '600',
  },

  // Input Row (Edit Mode)
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  inputLabel: {
    color: '#888',
    fontSize: 16,
    fontFamily: 'Avenir Next',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 100,
    color: '#fff',
    fontSize: 16,
    fontFamily: 'DIN Alternate',
    fontWeight: '600',
    textAlign: 'right',
  },
  inputCalculated: {
    backgroundColor: '#0d2818',
    borderColor: '#065f46',
  },
  inputUnit: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    width: 16,
  },
  calculatedBadge: {
    backgroundColor: '#065f46',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  calculatedBadgeText: {
    color: '#34d399',
    fontSize: 10,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  // Hint
  hintContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  hintText: {
    color: '#888',
    fontSize: 13,
    fontFamily: 'Avenir Next',
    textAlign: 'center',
  },

  // Error
  errorContainer: {
    backgroundColor: '#2a1a1a',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    textAlign: 'center',
  },

  // Formula Reference
  formulaSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  formulaTitle: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  formulaText: {
    color: '#888',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    marginBottom: 4,
  },

  // Bottom Buttons
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#333',
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    color: '#666',
  },
});
