import AsyncStorage from '@react-native-async-storage/async-storage';
import { nextFeaturedCard, type FeaturedCardId } from '@/services/featuredCards';

const STORAGE_KEY = 'chase.home-artwork.v1';
let sessionCard: Promise<FeaturedCardId> | undefined;

async function drawCard(): Promise<FeaturedCardId> {
  // Decorative artwork must never prevent loading the user's collection.
  const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
  const { cardId, rotation } = nextFeaturedCard(stored);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rotation)).catch(() => undefined);
  return cardId;
}

/** One selection per JS app launch, shared across tab changes, remounts and load retries. */
export function loadSessionFeaturedCard(): Promise<FeaturedCardId> {
  return sessionCard ??= drawCard();
}
