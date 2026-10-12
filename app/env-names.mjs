// Settings were first named with the earlier Calenne spelling. Read the Caleane name first and
// fall back to the old one, so a server configured before the rename keeps working unchanged.
export function caleaneEnv(name,env=process.env){return env['CALEANE_'+name]||env['CALENNE_'+name]||'';}
