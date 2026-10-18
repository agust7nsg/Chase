import type { Card } from '../../types/domain';

export interface CatalogSet {
  id: string;
  name: string;
  cardCount?: { official: number; total: number };
  logo?: string;
  symbol?: string;
}

export interface CatalogSetDetails extends CatalogSet {
  releaseDate?: string;
  cards: { id: string; name: string; localId: string; image?: string }[];
}

export interface CatalogQuery {
  query?: string;
  setId?: string;
  collectorNumber?: string;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

export interface CatalogPage {
  cards: Card[];
  page: number;
  hasMore: boolean;
  total?: number;
  fromCache: boolean;
  stale: boolean;
}

export interface CatalogStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

export interface TcgDexOptions {
  fetch?: typeof globalThis.fetch;
  storage?: CatalogStorage;
  now?: () => number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  onCards?: (cards: Card[]) => void;
  language?: string;
  baseUrl?: string;
  maxCacheEntries?: number;
}

export type CatalogErrorCode = 'NETWORK' | 'TIMEOUT' | 'HTTP' | 'INVALID_RESPONSE' | 'ABORTED';

export class CatalogError extends Error {
  cachedCard?: Card;
  cachedCards?: Card[];
  constructor(public readonly code: CatalogErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = 'CatalogError';
  }
}
