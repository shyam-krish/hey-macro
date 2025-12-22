import {
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  FlatList,
} from 'react-native';
import { FoodEntry } from '../types';

interface MealDetailSheetProps {
  visible: boolean;
  title: string;
  entries: FoodEntry[];
  onClose: () => void;
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

function FoodItemRow({ item }: { item: FoodEntry }) {
  return (
    <View style={styles.foodItemRow}>
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
    </View>
  );
}

export function MealDetailSheet({
  visible,
  title,
  entries,
  onClose,
}: MealDetailSheetProps) {
  const totals = getMealTotals(entries);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.sheetContainer}>
          {/* Handle bar */}
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
          </View>

          {/* Food Items List */}
          <FlatList
            data={entries}
            keyExtractor={(item) => item.foodEntryID}
            renderItem={({ item }) => <FoodItemRow item={item} />}
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
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 24,
    fontFamily: 'Avenir Next',
    fontWeight: 'bold',
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
});
