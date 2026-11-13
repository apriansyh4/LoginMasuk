import 'server-only';
import { DEFAULT_LANG, dictionaries, type Dictionary, type Lang } from './dictionaries';

/** The app is Indonesian only. */
export async function getLang(): Promise<Lang> {
  return DEFAULT_LANG;
}

export async function getDict(): Promise<{ lang: Lang; t: Dictionary }> {
  const lang = await getLang();
  return { lang, t: dictionaries[lang] };
}
