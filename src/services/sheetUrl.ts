export type SheetUrlCheck =
  | { ok: true; url: string }
  | { ok: false; url: string; error: string };

const EXEC_URL = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/i;
const DEV_URL = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/dev(?:\?.*)?$/i;
const ECHO_URL = /^https:\/\/script\.googleusercontent\.com\/macros\/echo(?:\?|$)/i;
const EDITOR_URL = /^https:\/\/script\.google\.com\/(?:home\/)?d\//i;
const SCRIPT_HOST = /^https:\/\/script\.google\.com\//i;
const HTTPS_URL = /^https:\/\//i;

// Whitespace, direction marks and invisible characters that arrive with copied links.
const JUNK = /[\s ؜᠎​-‏‪-‮⁠﻿]/;
const SLASH_ALIASES = /[／∕⁄]/;

/**
 * Cleans a pasted Google Apps Script link: removes spaces, line breaks,
 * direction marks and slash look-alikes, then drops a trailing slash.
 */
export function cleanSheetUrl(raw: string): string {
  let out = '';
  for (const char of raw ?? '') {
    if (!JUNK.test(char) && !SLASH_ALIASES.test(char)) out += char;
  }
  if (out.startsWith('<')) out = out.slice(1);
  if (out.endsWith('>')) out = out.slice(0, -1);
  return out.replace(/\/+$/, '');
}

function preview(url: string): string {
  return url.length > 90 ? `${url.slice(0, 90)}…` : url;
}

export function checkSheetUrl(raw: string): SheetUrlCheck {
  const url = cleanSheetUrl(raw);
  if (!url) {
    return { ok: false, url, error: 'أدخل رابط تطبيق الويب أولاً.' };
  }
  if (EXEC_URL.test(url) || ECHO_URL.test(url)) {
    return { ok: true, url };
  }
  if (DEV_URL.test(url)) {
    return {
      ok: false,
      url,
      error: 'هذا رابط اختبار ينتهي بـ /dev. اعمل «عملية نشر جديدة» من محرر السكريبت وانسخ رابط تطبيق الويب المنتهي بـ /exec.',
    };
  }
  if (EDITOR_URL.test(url)) {
    return {
      ok: false,
      url,
      error: `هذا رابط محرر السكربت وليس رابط تطبيق الويب. افتح «نشر ← عملية نشر جديدة» وانسخ الرابط المنتهي بـ /exec. الرابط: ${preview(url)}`,
    };
  }
  if (SCRIPT_HOST.test(url)) {
    return {
      ok: false,
      url,
      error: `رابط Apps Script غير مكتمل، يجب أن ينتهي بـ /exec. الرابط: ${preview(url)}`,
    };
  }
  if (!HTTPS_URL.test(url)) {
    return { ok: false, url, error: `الرابط يجب أن يبدأ بـ https://. الرابط: ${preview(url)}` };
  }
  return {
    ok: false,
    url,
    error: `الرابط ليس رابط تطبيق ويب من Apps Script، يجب أن يبدأ بـ https://script.google.com/macros/s/ وينتهي بـ /exec. الرابط: ${preview(url)}`,
  };
}
