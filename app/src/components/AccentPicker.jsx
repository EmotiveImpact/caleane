import React,{useEffect,useRef,useState} from 'react';
import {ACCENT_PRESETS,accentContrast,usableAccent} from '../lib/accent-theme.js';
import './accent-picker.css';
import {WorkspaceRadioChoices} from './workspace/WorkspaceUI';

export function AccentPicker({value,onChange}) {
  const [accent,setAccent] = useState(usableAccent(value));
  const input = useRef(null);
  const contrast = accentContrast(accent);
  const readable = contrast >= 4.5;
  const isPreset = ACCENT_PRESETS.some(preset => preset.value === accent);
  const choose = next => {setAccent(next);onChange?.(next);};

  useEffect(() => setAccent(usableAccent(value)), [value]);
  useEffect(() => {
    document.documentElement.style.setProperty('--studio-accent', usableAccent(accent));
    return () => document.documentElement.style.setProperty('--studio-accent', usableAccent(value));
  }, [accent,value]);
  useEffect(() => {
    input.current?.setCustomValidity(readable ? '' : 'Choose a darker colour that remains readable on white.');
  }, [readable]);

  return <fieldset className="accent-picker">
    <legend>Workspace accent</legend>
    <p>Used for actions and selected items. Your sidebar stays charcoal; status colours keep their meaning.</p>
    <WorkspaceRadioChoices className="accent-options" label="Accent colour presets" options={ACCENT_PRESETS} value={accent} onChange={choose}/>
    <label className="accent-custom"><span>Custom colour</span><span className="accent-custom-control"><input ref={input} type="color" name="accent" value={accent} onChange={event => choose(event.target.value.toLowerCase())} aria-describedby="accent-guidance"/><span>{isPreset ? 'Choose any other shade' : accent.toUpperCase()}</span></span></label>
    <small id="accent-guidance">{readable ? 'Preview updates now. Save settings to keep this colour for your studio.' : 'Choose a darker shade so text and controls remain readable.'}</small>
  </fieldset>;
}
