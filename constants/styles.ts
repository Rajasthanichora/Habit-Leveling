// Powered by OnSpace.AI
import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, FontSize, FontWeight } from './theme';

export const globalStyles = StyleSheet.create({
  flex1: { flex: 1 },
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  bodyText: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.regular,
  },
  headingText: {
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: Colors.separator,
  },
  inputBase: {
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.chipBg,
    marginRight: Spacing.sm,
  },
  chipSelected: {
    backgroundColor: Colors.chipSelected,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  chipTextSelected: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
});
