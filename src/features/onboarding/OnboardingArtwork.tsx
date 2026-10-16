import { Image } from 'expo-image';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Icon, Label, uiStyles } from '@/components/ui';
import { colors } from '@/theme/tokens';

const featuredCards = {
  charizard: {
    name: 'Charizard', printing: 'Base Set · Holo · 4/102',
    source: require('../../../assets/onboarding/charizard-base-set.webp'),
  },
  greninja: {
    name: 'Ash-Greninja EX', printing: 'XY Black Star Promo · XY133',
    source: require('../../../assets/onboarding/ash-greninja-ex.webp'),
  },
} as const;
type FeaturedCard = keyof typeof featuredCards;

/** Intro illustrations only: these do not add catalog entries or grant recognition. */
function CardPrint({ card, style }: { card: FeaturedCard; style?: ViewStyle }) {
  const item = featuredCards[card];
  return <View style={[styles.print, style]}>
    <Image source={item.source} contentFit="contain" cachePolicy="memory-disk"
      style={{ width: '100%', aspectRatio: 600 / 825 }}
      accessibilityLabel={`${item.name}, ${item.printing}, Pokémon TCG card`} />
  </View>;
}

function PricePreview() {
  return <View style={styles.pricePreview}>
    <View style={{ flex: 1, gap: 2 }}><Label kind="caption" style={{ fontWeight: '600' }}>Charizard · Base Set</Label><Label kind="caption" style={uiStyles.muted}>Illustrative price · USD</Label></View>
    <Label kind="heading" style={{ color: colors.primary, fontVariant: ['tabular-nums'] }}>$245.00</Label>
  </View>;
}

function CardShowcase() {
  return <View style={styles.stage}>
    <View style={styles.captionRow}><Icon name="sparkles-outline" size={17} color={colors.primary} /><Label kind="eyebrow" style={{ color: colors.primary }}>THE ONES WORTH CHASING</Label></View>
    <View style={styles.deck}>
      <View style={styles.orbit} />
      <CardPrint card="greninja" style={styles.rightCard} />
      <CardPrint card="charizard" style={styles.leftCard} />
      <View style={styles.holoTag}><Icon name="star" size={13} color={colors.warmText} /><Label kind="caption" style={{ fontWeight: '700', color: colors.warmText }}>Holo rare</Label></View>
    </View>
    <PricePreview />
  </View>;
}

function ScanPreview({ trial }: { trial: boolean }) {
  const card: FeaturedCard = trial ? 'charizard' : 'greninja';
  const item = featuredCards[card];
  return <View style={styles.stage}>
    <View style={styles.captionRow}><Icon name="scan-outline" size={18} color={colors.primary} /><Label kind="eyebrow" style={{ color: colors.primary }}>RECOGNITION PREVIEW</Label></View>
    <View style={styles.scanStage}>
      <View style={styles.scanFrame}>
        {(['tl', 'tr', 'bl', 'br'] as const).map(corner => <View key={corner} style={[styles.corner, styles[corner]]} />)}
      </View>
      <CardPrint card={card} style={styles.scanCard} />
    </View>
    <View style={styles.result}>
      <View style={styles.resultIcon}><Icon name="layers-outline" color={colors.primary} size={20} /></View>
      <View style={{ flex: 1, gap: 2 }}><Label style={{ fontWeight: '700' }}>{item.name}</Label><Label kind="caption" style={uiStyles.muted}>{item.printing}</Label></View>
      <View style={styles.demoBadge}><Label kind="caption" style={{ color: colors.primary, fontWeight: '600' }}>Demo</Label></View>
    </View>
  </View>;
}

function CollectionPreview() {
  return <View style={styles.stage}>
    <View style={styles.captionRow}><Icon name="albums-outline" color={colors.primary} size={18} /><Label kind="eyebrow" style={{ color: colors.primary }}>COLLECTION PREVIEW</Label></View>
    <View style={styles.collectionCards}>
      <CardPrint card="charizard" style={{ width: '43%', transform: [{ rotate: '-5deg' }] }} />
      <CardPrint card="greninja" style={{ width: '43%', transform: [{ rotate: '5deg' }] }} />
    </View>
    <View style={styles.wallet}>
      <View style={uiStyles.between}><View style={styles.resultIcon}><Icon name="wallet-outline" color={colors.primary} size={20} /></View><Label kind="caption" style={{ color: colors.primary, fontWeight: '600' }}>Your card wallet</Label></View>
      <PricePreview />
    </View>
  </View>;
}

export function OnboardingArtwork({ step }: { step: 0 | 1 | 2 | 3 }) {
  if (step === 0) return <CardShowcase />;
  if (step === 2) return <CollectionPreview />;
  return <ScanPreview trial={step === 3} />;
}

const styles = StyleSheet.create({
  stage: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 18, gap: 16, borderRadius: 24, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.tintBorder, overflow: 'hidden' },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  print: { overflow: 'hidden', borderRadius: 8, backgroundColor: colors.white, shadowColor: colors.text, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 3 },
  deck: { height: 252, width: '100%', maxWidth: 340, alignSelf: 'center', justifyContent: 'center' },
  orbit: { position: 'absolute', width: 230, height: 230, borderRadius: 115, backgroundColor: colors.tintBorder, alignSelf: 'center' },
  rightCard: { position: 'absolute', width: '52%', right: '4%', top: 16, transform: [{ rotate: '12deg' }] },
  leftCard: { position: 'absolute', width: '55%', left: '5%', top: 0, transform: [{ rotate: '-10deg' }] },
  holoTag: { position: 'absolute', right: 2, bottom: 2, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.warm, borderColor: '#E9D6A7', borderWidth: 1, borderRadius: 8 },
  pricePreview: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.white, borderRadius: 12, padding: 14 },
  scanStage: { height: 246, justifyContent: 'center', alignItems: 'center' },
  scanCard: { width: 148, transform: [{ rotate: '3deg' }] },
  scanFrame: { position: 'absolute', width: 194, height: 234 },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: colors.primary },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  result: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: 12, padding: 12 },
  resultIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  demoBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.primarySoft },
  collectionCards: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 10, maxWidth: 340, alignSelf: 'center', width: '100%' },
  wallet: { padding: 12, gap: 4, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.tintBorder },
});
