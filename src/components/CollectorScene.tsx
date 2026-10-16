import { Image } from 'expo-image';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { catalog } from '@/data/mocks/catalog';
import { visualFor, type CollectorMood } from '@/data/cardVisuals';
import { colors } from '@/theme/tokens';
import { CardPrint } from './CardPrint';

const scenes: Record<CollectorMood, number> = {
  moon: require('../../assets/scenes/moon.svg'), sky: require('../../assets/scenes/sky.svg'),
  ember: require('../../assets/scenes/ember.svg'), garden: require('../../assets/scenes/garden.svg'), cosmic: require('../../assets/scenes/cosmic.svg'),
};
/** Original contour landscapes, hidden from assistive technology. */
export function CollectorBackdrop({ mood = 'moon', opacity = 1 }: { mood?: CollectorMood; opacity?: number }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Image source={scenes[mood]} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false} />
  </View>;
}
/** Open editorial composition. Entire prints retain their original aspect ratio. */
export function CollectorScene({ ids, mood, height = 258, style, framed = false, compact = false }: { ids: readonly string[]; mood?: CollectorMood; height?: number; style?: ViewStyle; framed?: boolean; compact?: boolean }) {
  const cards = ids.flatMap(id => { const card = catalog.find(c => c.id === id); return card ? [card] : []; }).slice(0, 3);
  return <View style={[styles.scene, { height }, style]}>
    <CollectorBackdrop mood={mood ?? (cards[0] ? visualFor(cards[0]).mood : 'moon')} />
    <View style={styles.arrangement}>
      {cards.map((card, index) => <View key={card.id} style={[styles.print, cards.length === 1 ? styles.solo : index === 0 ? styles.center : index === 1 ? styles.left : styles.right, compact && (index === 0 ? styles.smallCenter : index === 1 ? styles.smallLeft : styles.smallRight)]}>
        <CardPrint card={card} />
      </View>)}
      {framed ? <View pointerEvents="none" style={styles.scanFrame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {(['tl', 'tr', 'bl', 'br'] as const).map(corner => <View key={corner} style={[styles.corner, styles[corner]]} />)}
      </View> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  scene: { overflow: 'hidden', justifyContent: 'center' },
  arrangement: { width: '100%', maxWidth: 430, alignSelf: 'center', height: '100%', justifyContent: 'center', alignItems: 'center' },
  print: { position: 'absolute', width: '36%', maxWidth: 170, shadowColor: colors.text, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 10, elevation: 4 },
  center: { left: '32%', top: 18, zIndex: 2, transform: [{ rotate: '-5deg' }] },
  left: { width: '31%', left: '8%', top: 49, transform: [{ rotate: '-17deg' }] },
  right: { width: '31%', right: '7%', top: 40, transform: [{ rotate: '15deg' }] },
  solo: { width: '40%', maxWidth: 164, transform: [{ rotate: '4deg' }] },
  smallCenter: { width: '24%', left: '38%', top: 14 },
  smallLeft: { width: '22%', left: '18%', top: 25 },
  smallRight: { width: '22%', right: '18%', top: 22 },
  scanFrame: { position: 'absolute', width: '57%', maxWidth: 228, height: '91%' },
  corner: { position: 'absolute', width: 23, height: 23, borderColor: colors.primary },
  tl: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 10 },
  tr: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 10 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 10 },
  br: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 10 },
});
