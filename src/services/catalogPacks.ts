import AsyncStorage from '@react-native-async-storage/async-storage';
import installedIndex from '../data/catalog/index.json';
import { bundledPacks } from '../data/catalog/loaders';
import publicProject from '../config/publicProject.json';
import { CatalogPackStore } from './tcgdex/packs';

export const installedCatalog = new CatalogPackStore({
  index: installedIndex, loaders: bundledPacks, storage: AsyncStorage,
  search: () => require('../data/catalog/search.json'),
  baseUrl: `${publicProject.url}/storage/v1/object/public/chase-catalog`,
});
