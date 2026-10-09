import React from 'react';

// Keeps one unreadable record from blanking the whole workspace: the section shows a note and a retry instead.
export class SectionBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null};}
 static getDerivedStateFromError(error){return {error};}
 componentDidCatch(error){console.error(error);}
 componentDidUpdate(previous){if(this.state.error&&previous.resetKey!==this.props.resetKey)this.setState({error:null});}
 render(){
  if(!this.state.error)return this.props.children;
  return <div className="section-fallback" role="alert"><strong>This section could not be shown.</strong><p>Something in this record could not be displayed. Try again, or refresh the page if it keeps happening.</p><button type="button" className="button secondary" onClick={()=>this.setState({error:null})}>Try again</button></div>;
 }
}
