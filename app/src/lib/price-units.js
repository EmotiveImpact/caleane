// How a price list item is charged. "each" needs no words; the rest read "per hour", "per person" and so on.
export const PRICE_UNITS=['each','hour','day','person','item','set'];
export const perUnit=unit=>unit&&unit!=='each'?`per ${unit}`:'';
