// Calendar dates (YYYY-MM-DD) are read at local midday so they never shift a day in
// time zones west of UTC. Timestamps are read as they are.
const pad=n=>String(n).padStart(2,'0');
export const dayDate=value=>{if(!value)return null;const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00':value);return isNaN(d)?null:d;};
export const formatDay=(value,fallback='')=>dayDate(value)?.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})||fallback;
// Short dates in lists and notes: "9 Oct" this year, "9 Oct 2027" in any other year.
export const shortDay=(value,fallback='')=>{const d=value instanceof Date?value:dayDate(value);if(!d||isNaN(d))return fallback;return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',...(d.getFullYear()===new Date().getFullYear()?{}:{year:'numeric'})});};
export const isoDay=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
export const todayISO=()=>isoDay(new Date());
export const daysFromToday=days=>{const d=new Date();d.setDate(d.getDate()+days);return isoDay(d);};
