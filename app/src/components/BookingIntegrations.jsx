import React,{useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {WorkspaceButton,WorkspaceField,WorkspaceSelect,WorkspaceStatus,WorkspaceSwitch} from './workspace/WorkspaceUI';
import './booking-integrations.css';

const calendarName={google:'Google Calendar',outlook:'Outlook'};
const meetingName={zoom:'Zoom',google_meet:'Google Meet'};

// Calendar and video settings for consultation bookings, under the booking settings.
export function BookingIntegrations({studio,request,navigate}){
 const endpoint='/api/booking-integrations?studio='+studio.id;
 const [data,setData]=useState(null),[form,setForm]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 useEffect(()=>{let active=true;request(endpoint).then(result=>{if(active){setData(result);setForm(result.settings);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[endpoint,request]);
 async function send(body){setBusy(true);setError('');try{const result=await request(endpoint,'POST',body);setData(result);setForm(result.settings);return result;}catch(e){setError(e.message);return null;}finally{setBusy(false);}}
 if(!data||!form)return error?<p className="commerce-error" role="alert">{error}</p>:null;
 const set=patch=>{setSaved(false);setForm({...form,...patch});};
 const anyCalendar=data.calendars.google.connected||data.calendars.outlook.connected;
 const calendarOptions=[{value:'none',label:'Don’t add bookings to a calendar'},...['google','outlook'].map(id=>({value:id,label:calendarName[id]+(data.calendars[id].connected?'':data.calendars[id].configured?' (connect first)':' (coming soon)'),disabled:!data.calendars[id].connected}))];
 const videoOptions=[{value:'fixed',label:'Use the link typed above'},{value:'google_meet',label:'Make a Google Meet link for each booking'+(form.calendar==='google'?'':' (needs Google Calendar)'),disabled:form.calendar!=='google'},{value:'zoom',label:'Make a Zoom meeting for each booking'+(data.zoom.configured?'':' (coming soon)'),disabled:!data.zoom.configured}];
 return <section className="booking-integrations">
  <form className="booking-integrations-card" onSubmit={async e=>{e.preventDefault();if(await send({action:'save',settings:form}))setSaved(true);}}>
   <header><h3>Calendar and video</h3><p>Add each booking to your calendar, keep your busy times off the booking page, and give every video call its own link.</p></header>
   {!anyCalendar&&<p className="booking-integrations-note">Connect Google Calendar or Outlook under <button type="button" className="text-button" onClick={()=>navigate?.('connections')}>Connections</button> to use your calendar here.</p>}
   <div className="settings-fields">
    <WorkspaceField className="settings-field-wide" label="Add bookings to"><WorkspaceSelect label="Add bookings to" value={form.calendar||'none'} onValueChange={value=>{const calendar=value==='none'?'':value;set({calendar,video:form.video==='google_meet'&&calendar!=='google'?'fixed':form.video});}} options={calendarOptions}/></WorkspaceField>
    <WorkspaceField className="settings-field-wide" label="Video links"><WorkspaceSelect label="Video links" value={form.video} onValueChange={video=>set({video})} options={videoOptions}/></WorkspaceField>
   </div>
   {form.calendar&&<WorkspaceSwitch label="Hide times when I’m busy" description={`Times that clash with events in your ${calendarName[form.calendar]} are not offered.`} checked={form.checkBusy} onCheckedChange={checkBusy=>set({checkBusy})}/>}
   {error&&<p className="commerce-error" role="alert">{error}</p>}
   <footer className="settings-save-row"><WorkspaceButton type="submit" disabled={busy}>{busy?'Saving…':'Save calendar and video'}</WorkspaceButton>{saved&&<span role="status">Saved.</span>}</footer>
   <p className="booking-integrations-small">Video links only apply when “How you meet” is a video call. The client sees the link as soon as they book. Calendar events are private to you: no invitation is sent from your calendar. Cancelling a booking removes its event and Zoom meeting.</p>
  </form>
  {data.upcoming.some(item=>item.meetingUrl||item.calendar||item.error)&&<div className="booking-integrations-card"><header><h3>Upcoming bookings</h3></header><ul className="booking-integrations-list">{data.upcoming.map(item=><li key={item.id}><div>{item.meetingUrl?<a href={item.meetingUrl} target="_blank" rel="noreferrer">{meetingName[item.meetingProvider]||'Video'} link</a>:<span>No video link</span>}<small>{item.calendar?`In your ${calendarName[item.calendar]}`:'Not in a calendar'}{item.error?` · ${item.error}`:''}</small></div>{item.error?<WorkspaceButton variant="ghost" size="small" disabled={busy} onClick={()=>send({action:'retry',id:item.id})}><RefreshCw size={14}/> Try again</WorkspaceButton>:<WorkspaceStatus value="Ready" tone="success"/>}</li>)}</ul></div>}
 </section>;
}
