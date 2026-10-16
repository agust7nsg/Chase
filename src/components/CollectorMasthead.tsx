import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { getCatalogCard } from '@/data/mocks/catalog';
import { visualFor } from '@/data/cardVisuals';
import { colors } from '@/theme/tokens';
import { CollectorBackdrop } from './CollectorScene';
import { CardPrint } from './CardPrint';
import { Label, uiStyles } from './ui';

/** A quiet full-width art vignette shared by inventory and catalog headers. */
export function CollectorMasthead({ title, eyebrow, caption, cardId }: { title: string; eyebrow: string; caption: string; cardId: string }) {
  const card = getCatalogCard(cardId)!;
  const { fontScale } = useWindowDimensions();
  return <View style={styles.header}>
    <CollectorBackdrop mood={visualFor(card).mood} opacity={0.7} />
    <View style={{ flex: 1, gap: 6 }}><Label kind="eyebrow" style={{ color: colors.primary }}>{eyebrow}</Label><Label kind="title" accessibilityRole="header">{title}</Label><Label kind="caption" style={uiStyles.muted}>{caption}</Label></View>
    {fontScale <= 1.3 ? <View style={styles.print} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><CardPrint card={card} /></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  header: { marginHorizontal: -24, paddingHorizontal: 24, paddingVertical: 24, flexDirection: 'row', alignItems: 'center', gap: 18, overflow: 'hidden' },
  print: { width: '24%', maxWidth: 96, transform: [{ rotate: '10deg' }] },
});
