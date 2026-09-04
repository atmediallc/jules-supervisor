import "server-only";
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isValidLocale, LOCALE_COOKIE, timeZone } from "./config";
import { getMessages } from "./messages";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale =
    localeCookie && isValidLocale(localeCookie) ? localeCookie : defaultLocale;

  return {
    locale,
    timeZone,
    messages: getMessages(locale),
  };
});
