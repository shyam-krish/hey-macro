import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  FlatList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FoodEntry } from '../types';
import { updateFoodEntry, deleteFoodEntry } from '../services/storage';

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

// Calculate calories from macros: protein*4 + carbs*4 + fat*9
function calculateCaloriesFromMacros(protein: number, carbs: number, fat: number): number {
  return Math.round(protein * 4 + carbs * 4 + fat * 9);
}

// Scale macros proportionally to match a new calorie target
function scaleMacrosToCalories(
  originalProtein: number,
  originalCarbs: number,
  originalFat: number,
  originalCalories: number,
  newCalories: number
): { protein: number; carbs: number; fat: number } {
  if (originalCalories === 0) {
    // Can't scale from zero - return zeros
    return { protein: 0, carbs: 0, fat: 0 };
  }

  const ratio = newCalories / originalCalories;
  return {
    protein: Math.round(originalProtein * ratio),
    carbs: Math.round(originalCarbs * ratio),
    fat: Math.round(originalFat * ratio),
  };
}

// Parse quantity string into number and unit (e.g., "100g" -> { number: 100, unit: "g" })
function parseQuantity(quantity: string): { number: number | null; unit: string } {
  const trimmed = quantity.trim();
  // Match number at start (including decimals) followed by optional unit
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    return {
      number: parseFloat(match[1]),
      unit: match[2] || '',
    };
  }
  // No number found - return null number with full string as "unit"
  return { number: null, unit: trimmed };
}

// Format quantity from number and unit
function formatQuantity(num: number | null, unit: string): string {
  if (num === null) return unit;
  return unit ? `${num}${unit}` : String(num);
}

function FoodItemRow({
  item,
  isEditing,
  editForm,
  saving,
  error,
  quantityUnit,
  onPress,
  onEditFormChange,
  onSave,
  onCancel,
  onDelete,
}: {
  item: FoodEntry;
  isEditing: boolean;
  editForm: EditFormState;
  saving: boolean;
  error: string | null;
  quantityUnit: string;
  onPress: () => void;
  onEditFormChange: (form: EditFormState, changedField?: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <View style={styles.foodItemRow}>
        {/* Delete button - top right */}
        <Pressable
          style={styles.deleteButton}
          onPress={onDelete}
          disabled={saving}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color="#666" />
        </Pressable>

        {/* Name & Quantity - inline editable */}
        <View style={styles.foodItemInfo}>
          <View style={styles.inlineInputGroup}>
            <TextInput
              style={styles.inlineNameInput}
              value={editForm.name}
              onChangeText={(text) =>
                onEditFormChange({ ...editForm, name: text })
              }
              placeholder="Food name"
              placeholderTextColor="#666"
            />
            <Text style={styles.inlineInputLabel}>NAME</Text>
          </View>
          <View style={styles.inlineInputGroup}>
            <View style={styles.quantityInputRow}>
              <TextInput
                style={styles.inlineQuantityInput}
                value={editForm.quantity}
                onChangeText={(text) =>
                  onEditFormChange({ ...editForm, quantity: text }, 'quantity')
                }
                placeholder="0"
                placeholderTextColor="#555"
                keyboardType={quantityUnit ? 'number-pad' : 'default'}
              />
              {quantityUnit ? (
                <Text style={styles.quantityUnitSuffix}>{quantityUnit}</Text>
              ) : null}
            </View>
            <Text style={styles.inlineInputLabel}>QUANTITY</Text>
          </View>
        </View>

        {/* Macros - same layout as view mode but editable */}
        <View style={styles.foodItemMacros}>
          <View style={styles.macroItem}>
            <TextInput
              style={styles.inlineMacroInput}
              value={editForm.calories}
              onChangeText={(text) =>
                onEditFormChange({ ...editForm, calories: text }, 'calories')
              }
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#666"
            />
            <Text style={styles.macroLabel}>cal</Text>
          </View>
          <View style={styles.macroItem}>
            <View style={styles.macroInputRow}>
              <TextInput
                style={styles.inlineMacroInput}
                value={editForm.protein}
                onChangeText={(text) =>
                  onEditFormChange({ ...editForm, protein: text }, 'protein')
                }
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#666"
              />
              <Text style={styles.macroUnitSuffix}>g</Text>
            </View>
            <Text style={styles.macroLabel}>protein</Text>
          </View>
          <View style={styles.macroItem}>
            <View style={styles.macroInputRow}>
              <TextInput
                style={styles.inlineMacroInput}
                value={editForm.carbs}
                onChangeText={(text) =>
                  onEditFormChange({ ...editForm, carbs: text }, 'carbs')
                }
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#666"
              />
              <Text style={styles.macroUnitSuffix}>g</Text>
            </View>
            <Text style={styles.macroLabel}>carbs</Text>
          </View>
          <View style={styles.macroItem}>
            <View style={styles.macroInputRow}>
              <TextInput
                style={styles.inlineMacroInput}
                value={editForm.fat}
                onChangeText={(text) =>
                  onEditFormChange({ ...editForm, fat: text }, 'fat')
                }
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#666"
              />
              <Text style={styles.macroUnitSuffix}>g</Text>
            </View>
            <Text style={styles.macroLabel}>fat</Text>
          </View>
        </View>

        {/* Error message */}
        {error && <Text style={styles.inlineEditError}>{error}</Text>}

        {/* Compact action buttons */}
        <View style={styles.inlineEditActions}>
          <Pressable
            style={styles.inlineCancelButton}
            onPress={onCancel}
            disabled={saving}
          >
            <Text style={styles.inlineCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.inlineSaveButton, saving && styles.saveButtonDisabled]}
            onPress={onSave}
            disabled={saving}
          >
            <Text style={styles.inlineSaveText}>
              {saving ? 'Saving...' : 'Save'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
  // Track original numeric values when editing starts (for stable scaling)
  const [originalMacros, setOriginalMacros] = useState<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    quantityNumber: number | null;
    quantityUnit: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  // Reset edit state when sheet closes
  useEffect(() => {
    if (!visible) {
      setEditingItem(null);
      setSaving(false);
      setEditError(null);
      setDeleteConfirmVisible(false);
      setOriginalMacros(null);
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
    setEditError(null);
    // Parse quantity into number and unit for scaling
    const parsedQuantity = parseQuantity(item.quantity);
    // Store original macros and quantity for stable scaling
    setOriginalMacros({
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      quantityNumber: parsedQuantity.number,
      quantityUnit: parsedQuantity.unit,
    });
    setEditForm({
      name: item.name,
      quantity: parsedQuantity.number !== null ? String(parsedQuantity.number) : item.quantity,
      calories: String(item.calories),
      protein: String(item.protein),
      carbs: String(item.carbs),
      fat: String(item.fat),
    });
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditError(null);
    setOriginalMacros(null);
    setEditForm({
      name: '',
      quantity: '',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
    });
  };

  // Smart form change handler that syncs calories <-> macros <-> quantity
  const handleEditFormChange = (newForm: EditFormState, changedField?: string) => {
    if (!originalMacros) {
      setEditForm(newForm);
      return;
    }

    // Parse current values
    const protein = parseInt(newForm.protein, 10) || 0;
    const carbs = parseInt(newForm.carbs, 10) || 0;
    const fat = parseInt(newForm.fat, 10) || 0;
    const calories = parseInt(newForm.calories, 10) || 0;

    // Detect which field changed
    const caloriesChanged = changedField === 'calories';
    const macrosChanged = changedField === 'protein' || changedField === 'carbs' || changedField === 'fat';
    const quantityChanged = changedField === 'quantity';

    if (quantityChanged && originalMacros.quantityNumber !== null && originalMacros.quantityNumber > 0) {
      // Quantity was edited - scale all macros proportionally from original
      const newQuantityNum = parseFloat(newForm.quantity) || 0;
      if (newQuantityNum > 0) {
        const ratio = newQuantityNum / originalMacros.quantityNumber;
        setEditForm({
          ...newForm,
          calories: String(Math.round(originalMacros.calories * ratio)),
          protein: String(Math.round(originalMacros.protein * ratio)),
          carbs: String(Math.round(originalMacros.carbs * ratio)),
          fat: String(Math.round(originalMacros.fat * ratio)),
        });
        return;
      }
      // If quantity is 0 or invalid, just update the form without scaling
      setEditForm(newForm);
      return;
    }

    if (caloriesChanged) {
      // Calories was edited - scale macros proportionally from ORIGINAL values
      // This ensures clearing and retyping calories doesn't lose the macro ratios
      const originalCaloriesFromMacros = calculateCaloriesFromMacros(
        originalMacros.protein,
        originalMacros.carbs,
        originalMacros.fat
      );

      if (originalCaloriesFromMacros > 0 && calories > 0) {
        const scaled = scaleMacrosToCalories(
          originalMacros.protein,
          originalMacros.carbs,
          originalMacros.fat,
          originalCaloriesFromMacros,
          calories
        );
        setEditForm({
          ...newForm,
          protein: String(scaled.protein),
          carbs: String(scaled.carbs),
          fat: String(scaled.fat),
        });
        return;
      }
      // If original macros were all 0 or new calories is 0, just update without scaling
      setEditForm(newForm);
      return;
    }

    if (macrosChanged) {
      // A macro was edited - recalculate calories
      const newCalories = calculateCaloriesFromMacros(protein, carbs, fat);
      setEditForm({
        ...newForm,
        calories: String(newCalories),
      });
      return;
    }

    setEditForm(newForm);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;

    // Validate numeric fields
    const calories = parseInt(editForm.calories, 10);
    const protein = parseInt(editForm.protein, 10);
    const carbs = parseInt(editForm.carbs, 10);
    const fat = parseInt(editForm.fat, 10);

    if (isNaN(calories) || isNaN(protein) || isNaN(carbs) || isNaN(fat)) {
      setEditError('Calories and macros must be valid numbers');
      return;
    }

    // Reconstruct quantity with unit if we have a parsed quantity
    let finalQuantity = editForm.quantity;
    if (originalMacros?.quantityUnit && originalMacros.quantityNumber !== null) {
      const quantityNum = parseFloat(editForm.quantity);
      if (!isNaN(quantityNum)) {
        finalQuantity = formatQuantity(quantityNum, originalMacros.quantityUnit);
      }
    }

    setSaving(true);
    setEditError(null);
    try {
      await updateFoodEntry(editingItem.foodEntryID, {
        name: editForm.name,
        quantity: finalQuantity,
        calories,
        protein,
        carbs,
        fat,
      });

      handleCancelEdit();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to save food entry:', error);
      setEditError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePress = () => {
    setDeleteConfirmVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (!editingItem) return;

    setDeleteConfirmVisible(false);
    setSaving(true);
    try {
      await deleteFoodEntry(editingItem.foodEntryID);
      handleCancelEdit();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to delete food entry:', error);
      setEditError('Failed to delete');
    } finally {
      setSaving(false);
    }
  };

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
              <FoodItemRow
                item={item}
                isEditing={editingItem?.foodEntryID === item.foodEntryID}
                editForm={editForm}
                saving={saving}
                error={editingItem?.foodEntryID === item.foodEntryID ? editError : null}
                quantityUnit={editingItem?.foodEntryID === item.foodEntryID ? (originalMacros?.quantityUnit ?? '') : ''}
                onPress={() => handleEditPress(item)}
                onEditFormChange={handleEditFormChange}
                onSave={handleSaveEdit}
                onCancel={handleCancelEdit}
                onDelete={handleDeletePress}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.foodItemDivider} />}
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
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

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteConfirmVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setDeleteConfirmVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>Delete Entry?</Text>
            <Text style={styles.confirmMessage}>
              This will permanently remove this food entry.
            </Text>
            <View style={styles.confirmButtons}>
              <Pressable
                style={styles.confirmCancelButton}
                onPress={() => setDeleteConfirmVisible(false)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.confirmDeleteButton}
                onPress={handleDeleteConfirm}
              >
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  // Inline edit styles
  deleteButton: {
    position: 'absolute',
    top: 20,
    right: 0,
    padding: 4,
    zIndex: 1,
  },
  inlineInputGroup: {
    marginBottom: 16,
    paddingRight: 36,
  },
  inlineNameInput: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
    padding: 0,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  inlineQuantityInput: {
    color: '#888',
    fontSize: 15,
    fontFamily: 'Avenir Next',
    padding: 0,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    flex: 1,
  },
  quantityInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityUnitSuffix: {
    color: '#888',
    fontSize: 15,
    fontFamily: 'Avenir Next',
    paddingBottom: 4,
    marginLeft: 2,
  },
  inlineInputLabel: {
    color: '#555',
    fontSize: 11,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  inlineMacroInput: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'DIN Alternate',
    fontWeight: '600',
    marginBottom: 2,
    padding: 0,
    textAlign: 'center',
    minWidth: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  macroInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroUnitSuffix: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'DIN Alternate',
    fontWeight: '600',
    marginBottom: 2,
    marginLeft: 1,
  },
  inlineEditError: {
    color: '#ff6b6b',
    fontSize: 12,
    fontFamily: 'Avenir Next',
    marginTop: 12,
  },
  inlineEditActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  inlineCancelButton: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  inlineCancelText: {
    color: '#888',
    fontSize: 15,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  inlineSaveButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  inlineSaveText: {
    color: '#000',
    fontSize: 15,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  // Delete confirmation modal
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 40,
    width: '80%',
    maxWidth: 300,
  },
  confirmTitle: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmMessage: {
    color: '#888',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmCancelButton: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmCancelText: {
    color: '#888',
    fontSize: 15,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
  confirmDeleteButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmDeleteText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
});
