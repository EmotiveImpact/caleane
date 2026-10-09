// An .ics file for a booked consultation, made in the browser so the client can add
// the call to any calendar. Times are UTC, so every calendar shows them in its own zone.
const stamp=iso=>new Date(iso).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const escape=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
// Lines longer than 75 octets fold onto continuation lines that start with a space.
const fold=line=>{let part='',out=[];for(const char of line){if(new TextEncoder().encode(part+char).length>73){out.push(part);part=' '+char;}else part+=char;}out.push(part);return out.join('\r\n');};
export function bookingIcs({id,start,end,title,studioName,location='',manageUrl='',cancelled=false,now=new Date().toISOString()}){
 const description=[`${title} with ${studioName}.`,manageUrl&&`Reschedule or cancel: ${manageUrl}`].filter(Boolean).join('\n');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Caleane//Consultation//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:consultation-${id}@caleane`,`DTSTAMP:${stamp(now)}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,
  `SUMMARY:${escape(`${title} with ${studioName}`)}`,`DESCRIPTION:${escape(description)}`,...(location?[`LOCATION:${escape(location)}`]:[]),...(manageUrl?[`URL:${manageUrl}`]:[]),`STATUS:${cancelled?'CANCELLED':'CONFIRMED'}`,'END:VEVENT','END:VCALENDAR',''].map(fold).join('\r\n');
}
export const icsHref=ics=>'data:text/calendar;charset=utf-8,'+encodeURIComponent(ics);
