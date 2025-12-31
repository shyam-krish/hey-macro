import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { FoodEntry } from '../types';
import { updateFoodEntry } from '../services/storage';

interface MealDetailSheetProps {
  visible: boolean;
  title: string;
  entries: FoodEntry[];
  onClose: () => void;
  onUpdate?: () => void;
  onModalHide?: () => void;
}

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

interface EditFormState {
  name: string;
  quantity: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

function FoodItemRow({
  item,
  onPress,
}: {
  item: FoodEntry;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.foodItemRow}>
      <View style={styles.foodItemInfo}>
        <Text style={styles.foodItemName}>{item.name}</Text>
        <Text style={styles.foodItemQuantity}>{item.quantity}</Text>
      </View>
      <View style={styles.foodItemMacros}>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{item.calories}</Text>
          <Text style={styles.macroLabel}>cal</Text>
        </View>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{item.protein}g</Text>
          <Text style={styles.macroLabel}>protein</Text>
        </View>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{item.carbs}g</Text>
          <Text style={styles.macroLabel}>carbs</Text>
        </View>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{item.fat}g</Text>
          <Text style={styles.macroLabel}>fat</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function MealDetailSheet({
  visible,
  title,
  entries,
  onClose,
  onUpdate,
  onModalHide,
}: MealDetailSheetProps) {
  const [editingItem, setEditingItem] = useState<FoodEntry | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    quantity: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
  });
  const [saving, setSaving] = useState(false);

  // Reset edit state when sheet closes
  useEffect(() => {
    if (!visible) {
      setEditingItem(null);
      setSaving(false);
      setEditForm({
        name: '',
        quantity: '',
        calories: '',
        protein: '',
        carbs: '',
        fat: '',
      });
    }
  }, [visible]);

  const totals = getMealTotals(entries);

  const handleEditPress = (item: FoodEntry) => {
    setEditingItem(item);
    setEditForm({
      name: item.name,
      quantity: item.quantity,
      calories: String(item.calories),
      protein: String(item.protein),
      carbs: String(item.carbs),
      fat: String(item.fat),
    });
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditForm({
      name: '',
      quantity: '',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;

    setSaving(true);
    try {
      await updateFoodEntry(editingItem.foodEntryID, {
        name: editForm.name,
        quantity: editForm.quantity,
        calories: parseInt(editForm.calories, 10) || 0,
        protein: parseInt(editForm.protein, 10) || 0,
        carbs: parseInt(editForm.carbs, 10) || 0,
        fat: parseInt(editForm.fat, 10) || 0,
      });

      handleCancelEdit();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to save food entry:', error);
      // Still close the edit modal on error
      handleCancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const renderEditModal = () => (
    <Modal
      visible={editingItem !== null}
      animationType="fade"
      transparent={true}
      onRequestClose={handleCancelEdit}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.editOverlay}
      >
        <Pressable style={styles.editDismissArea} onPress={handleCancelEdit} />
        <View style={styles.editContainer}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.editTitle}>Edit Food</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={editForm.name}
                onChangeText={(text) =>
                  setEditForm((prev) => ({ ...prev, name: text }))
                }
                placeholder="Food name"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Quantity</Text>
              <TextInput
                style={styles.textInput}
                value={editForm.quantity}
                onChangeText={(text) =>
                  setEditForm((prev) => ({ ...prev, quantity: text }))
                }
                placeholder="e.g., 1 cup, 100g"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.macroInputRow}>
              <View style={styles.macroInputGroup}>
                <Text style={styles.inputLabel}>Calories</Text>
                <TextInput
                  style={styles.macroInput}
                  value={editForm.calories}
                  onChangeText={(text) =>
                    setEditForm((prev) => ({ ...prev, calories: text }))
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#666"
                />
              </View>

              <View style={styles.macroInputGroup}>
                <Text style={styles.inputLabel}>Protein (g)</Text>
                <TextInput
                  style={styles.macroInput}
                  value={editForm.protein}
                  onChangeText={(text) =>
                    setEditForm((prev) => ({ ...prev, protein: text }))
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#666"
                />
              </View>
            </View>

            <View style={styles.macroInputRow}>
              <View style={styles.macroInputGroup}>
                <Text style={styles.inputLabel}>Carbs (g)</Text>
                <TextInput
                  style={styles.macroInput}
                  value={editForm.carbs}
                  onChangeText={(text) =>
                    setEditForm((prev) => ({ ...prev, carbs: text }))
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#666"
                />
              </View>

              <View style={styles.macroInputGroup}>
                <Text style={styles.inputLabel}>Fat (g)</Text>
                <TextInput
                  style={styles.macroInput}
                  value={editForm.fat}
                  onChangeText={(text) =>
                    setEditForm((prev) => ({ ...prev, fat: text }))
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#666"
                />
              </View>
            </View>

            <View style={styles.editButtonRow}>
              <Pressable
                style={styles.cancelButton}
                onPress={handleCancelEdit}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
      onDismiss={onModalHide}
    >
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.sheetContainer}>
          {/* Handle bar */}
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Text style={styles.editHint}>Tap item to edit</Text>
          </View>

          {/* Food Items List */}
          <FlatList
            data={entries}
            keyExtractor={(item) => item.foodEntryID}
            renderItem={({ item }) => (
              <FoodItemRow item={item} onPress={() => handleEditPress(item)} />
            )}
            ItemSeparatorComponent={() => <View style={styles.foodItemDivider} />}
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
          />

          {/* Footer with all totals */}
          <View style={styles.sheetFooter}>
            <View style={styles.footerRow}>
              <Text style={styles.footerLabel}>Total</Text>
              <View style={styles.footerMacros}>
                <View style={styles.footerMacroItem}>
                  <Text style={styles.footerMacroValue}>{totals.calories}</Text>
                  <Text style={styles.footerMacroLabel}>cal</Text>
                </View>
                <View style={styles.footerMacroItem}>
                  <Text style={styles.footerMacroValue}>{totals.protein}g</Text>
                  <Text style={styles.footerMacroLabel}>protein</Text>
                </View>
                <View style={styles.footerMacroItem}>
                  <Text style={styles.footerMacroValue}>{totals.carbs}g</Text>
                  <Text style={styles.footerMacroLabel}>carbs</Text>
                </View>
                <View style={styles.footerMacroItem}>
                  <Text style={styles.footerMacroValue}>{totals.fat}g</Text>
                  <Text style={styles.footerMacroLabel}>fat</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {renderEditModal()}
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  dismissArea: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    minHeight: 300,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  sheetHeader: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 24,
    fontFamily: 'Avenir Next',
    fontWeight: 'bold',
  },
  editHint: {
    color: '#666',
    fontSize: 13,
    fontFamily: 'Avenir Next',
  },
  listContainer: {
    flexGrow: 0,
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: 24,
  },
  foodItemRow: {
    paddingVertical: 20,
  },
  foodItemInfo: {
    marginBottom: 16,
  },
  foodItemName: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
    marginBottom: 4,
  },
  foodItemQuantity: {
    color: '#888',
    fontSize: 15,
    fontFamily: 'Avenir Next',
  },
  foodItemMacros: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroItem: {
    alignItems: 'center',
    flex: 1,
  },
  macroValue: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'DIN Alternate',
    fontWeight: '600',
    marginBottom: 2,
  },
  macroLabel: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'Avenir Next',
    textTransform: 'uppercase',
  },
  foodItemDivider: {
    height: 1,
    backgroundColor: '#2a2a2a',
  },
  sheetFooter: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    backgroundColor: '#1a1a1a',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLabel: {
    color: '#888',
    fontSize: 18,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  footerMacros: {
    flexDirection: 'row',
    flex: 1,
    marginLeft: 24,
    justifyContent: 'space-between',
  },
  footerMacroItem: {
    alignItems: 'center',
  },
  footerMacroValue: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'DIN Alternate',
    fontWeight: '600',
    marginBottom: 2,
  },
  footerMacroLabel: {
    color: '#666',
    fontSize: 11,
    fontFamily: 'Avenir Next',
    textTransform: 'uppercase',
  },
  // Edit modal styles
  editOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
  },
  editDismissArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  editContainer: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 24,
    maxHeight: '80%',
  },
  editTitle: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Avenir Next',
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#888',
    fontSize: 13,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Avenir Next',
  },
  macroInputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  macroInputGroup: {
    flex: 1,
  },
  macroInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Avenir Next',
    textAlign: 'center',
  },
  editButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 10,
    paddingVertical: 14,
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
    backgroundColor: '#3FE0DB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
});
