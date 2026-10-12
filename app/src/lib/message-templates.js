// Saved message templates fill {project_title} and friends before the studio sends them.

// A project's title carries the client's name ("Private celebration · Sophie Clarke") so the
// studio can tell projects apart. Writing to that client, the name reads oddly, so it is dropped.
export function clientProjectTitle(title,clientName){
 const text=String(title||'').trim(),name=String(clientName||'').trim();
 return name&&text.endsWith(' · '+name)?text.slice(0,-(name.length+3)).trim():text;
}

// With booking off there is no page to link to, so the sentence that offers the link goes.
// A paragraph left empty goes with it.
function withoutBookingLink(body){
 return body.split(/\n{2,}/).map(paragraph=>paragraph.split('\n').map(line=>line.includes('{booking_link}')?line.split(/(?<=[.!?])\s+/).filter(sentence=>!sentence.includes('{booking_link}')).join(' '):line).filter(line=>line.trim()).join('\n')).filter(Boolean).join('\n\n');
}

export function fillTemplate(body,values){
 const text=values.booking_link?body:withoutBookingLink(body);
 return text.replace(/\{([a-z_]+)\}/g,(match,key)=>values[key]??match);
}
