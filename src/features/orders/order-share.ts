/**
 * «Поделиться заданием» (владелец, 2026-09-11: «отправить другу ссылку в
 * WhatsApp; есть приложение — открывается это задание, нет — скачивается»).
 *
 * Ссылка ведёт на сайт, а не на схему xtrud:// — её понимает любой
 * мессенджер. На iPhone с приложением iOS открывает задание прямо в нём
 * (universal link: public/.well-known/apple-app-site-association). Без
 * приложения открывается страница сайта public/orders/index.html со ссылкой
 * в App Store.
 */

export const SITE_ORIGIN = "https://xtrud.pro";

export function orderShareUrl(orderId: string): string {
  return `${SITE_ORIGIN}/orders/${encodeURIComponent(orderId)}`;
}

/** Текст для мессенджера: название задания и ссылка отдельной строкой. */
export function orderShareMessage(title: string | null | undefined, orderId: string): string {
  const name = title?.trim();
  const url = orderShareUrl(orderId);
  return name ? `Задание в xtrud: ${name}\n${url}` : `Задание в xtrud\n${url}`;
}
