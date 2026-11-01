import { readFile, writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
try { loadEnvFile(fileURLToPath(new URL('.env.local', root))); }
catch { throw new Error('Copia tu .env.local que ya funciona a esta carpeta antes de continuar. Se requiere Node 22 o superior.'); }
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
if (url !== 'https://vzjekkgyrdxzlhaupnrw.supabase.co' || !/^sb_publishable_[A-Za-z0-9_-]{10,200}$/.test(key ?? '')) {
  throw new Error('Revisa la URL y la Publishable key PUBLICA de Supabase en .env.local. No uses service_role ni claves secretas.');
}
const path = new URL('eas.json', root);
const config = JSON.parse(await readFile(path, 'utf8'));
const profile = config.build?.preview;
if (!profile || profile.android?.buildType !== 'apk') throw new Error('Falta el perfil preview APK. Descarga la version actualizada.');
// Only these public values reach the bundle; never copy an entire environment file.
profile.env = { EXPO_PUBLIC_SCANNER_BACKEND: 'supabase', EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key };
await writeFile(path, JSON.stringify(config, null, 2) + '\n');
console.log('APK preparada con el escaner alojado y la configuracion PUBLICA de Supabase. Ninguna clave privada fue copiada.');
