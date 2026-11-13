import 'server-only';
import { DEFAULT_LANG, dictionaries, type Dictionary, type Lang } from './dictionaries';

/** The app is Indonesian only. */
export async function getLang(): Promise<Lang> {
  return DEFAULT_LANG;
}

/** AI_SERVICE_HOURS (optional) puts the AI schedule into the "AI is off" messages. */
function withSchedule(t: Dictionary): Dictionary {
  const hours = process.env.AI_SERVICE_HOURS?.trim();
  if (!hours) return t;
  return {
    ...t,
    studio: { ...t.studio, serviceDown: t.studio.serviceDownScheduled.replace('{hours}', hours) },
    gen: { ...t.gen, unavailable: t.gen.unavailableScheduled.replace('{hours}', hours) },
  };
}

export async function getDict(): Promise<{ lang: Lang; t: Dictionary }> {
  const lang = await getLang();
  return { lang, t: withSchedule(dictionaries[lang]) };
}
