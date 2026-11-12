import 'server-only';
import { cookies } from 'next/headers';
import { DEFAULT_LANG, dictionaries, type Dictionary, type Lang } from './dictionaries';

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get('lang')?.value;
  return v === 'en' || v === 'id' ? v : DEFAULT_LANG;
}

export async function getDict(): Promise<{ lang: Lang; t: Dictionary }> {
  const lang = await getLang();
  return { lang, t: dictionaries[lang] };
}
