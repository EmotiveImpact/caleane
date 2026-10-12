// Currencies a studio can price, invoice and record costs in. Every one uses two decimal places,
// which the app's minor-unit amounts assume, and every one is supported by Stripe Checkout.
export const CURRENCIES=['GBP','EUR','USD','AUD','CAD','NZD','CHF','SEK','NOK','DKK','ZAR','AED','SGD','HKD'];
export const isCurrency=code=>CURRENCIES.includes(code);
