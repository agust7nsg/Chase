/** Shared vendor adapter runs on Node locally and Deno in Supabase. Never import in the app. */
export { cardSightTransport, normalizeCardSightIdentification } from '../supabase/functions/_shared/cardsightTransport';
