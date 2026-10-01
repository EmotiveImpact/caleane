// Explicitly opt-in worker. No provider call occurs without the activation flag.
import {openStore} from '../store.mjs';
import {createAccountSecurity} from '../account-security.mjs';
import {createNotificationOutbox,createResendDelivery} from '../notifications.mjs';
if(process.env.CALEANE_EMAIL_ENABLED!=='1')throw new Error('Email delivery is disabled. Activate only after reviewing sender and recipients.');
for(const key of ['DATABASE_PATH','APP_ORIGIN','CALENNE_NOTIFICATION_KEY','RESEND_API_KEY','RESEND_FROM'])if(!process.env[key])throw new Error(`Configure ${key} before starting email delivery.`);
const db=openStore(process.env.DATABASE_PATH),options={origin:process.env.APP_ORIGIN,encryptionKey:process.env.CALENNE_NOTIFICATION_KEY},account=createAccountSecurity(db,options),outbox=createNotificationOutbox(db,options),deliver=createResendDelivery({apiKey:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM});
try{for(let count=0;count<50;count++){const result=await account.dispatchOne(deliver)||await outbox.dispatchOne(deliver);if(!result)break;console.log(JSON.stringify({state:result.state}));}}finally{db.close();}
