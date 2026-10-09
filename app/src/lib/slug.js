// A name as a web address part: "Okafor Photo" becomes "okafor-photo".
export const slugFrom=name=>String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60).replace(/-+$/,'');
