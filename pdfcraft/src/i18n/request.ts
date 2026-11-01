import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { mergeWithFallback } from '@/lib/i18n/fallback';

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that the incoming locale is valid
  if (!locale || !routing.locales.includes(locale as typeof routing.locales[number])) {
    locale = routing.defaultLocale;
  }

  // Always load English messages for fallback
  const englishMessages = (await import(`../../messages/en.json`)).default;

  // Load the messages for the requested locale
  let localeMessages;
  try {
    if (locale === 'en') {
      localeMessages = englishMessages;
    } else {
      localeMessages = (await import(`../../messages/${locale}.json`)).default;
    }
  } catch {
    // If locale file doesn't exist, use English
    localeMessages = {};
  }

  // Merge locale messages with English fallback
  // This ensures all keys are available, falling back to English for missing ones
  const messages = locale === 'en' 
    ? englishMessages 
    : mergeWithFallback(localeMessages, englishMessages);

  return {
    locale,
    messages,
    // Configure time zone and formats
    timeZone: 'UTC',
    now: new Date(),
  };
});
