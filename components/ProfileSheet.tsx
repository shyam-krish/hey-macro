import {
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { User, MacroTargets } from '../types';

interface ProfileSheetProps {
  visible: boolean;
  onClose: () => void;
  user: User | null;
  targets: MacroTargets | null;
}

export function ProfileSheet({
  visible,
  onClose,
  user,
  targets,
}: ProfileSheetProps) {
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
            <Text style={styles.sheetTitle}>Profile</Text>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {/* User Info */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>USER</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name</Text>
                <Text style={styles.infoValue}>
                  {user ? `${user.firstName} ${user.lastName}` : 'Loading...'}
                </Text>
              </View>
            </View>

            {/* Macro Targets */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>MACRO TARGETS</Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Calories</Text>
                <Text style={styles.infoValue}>
                  {targets?.calories || 0}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Protein</Text>
                <Text style={styles.infoValue}>
                  {targets?.protein || 0}g
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Carbs</Text>
                <Text style={styles.infoValue}>
                  {targets?.carbs || 0}g
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Fat</Text>
                <Text style={styles.infoValue}>
                  {targets?.fat || 0}g
                </Text>
              </View>
            </View>

            {/* TODO Comment */}
            <View style={styles.todoSection}>
              <Text style={styles.todoText}>
                {/* TODO: Add settings for editing targets */}
              </Text>
            </View>
          </View>

          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
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
    minHeight: 400,
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
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    flex: 1,
  },
  section: {
    marginBottom: 32,
  },
  sectionLabel: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 16,
    letterSpacing: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
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
  todoSection: {
    marginTop: 20,
  },
  todoText: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'Avenir Next',
    fontStyle: 'italic',
  },
  closeButton: {
    backgroundColor: '#2a2a2a',
    marginHorizontal: 24,
    marginBottom: 40,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Avenir Next',
    fontWeight: '600',
  },
});
