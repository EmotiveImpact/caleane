// A studio chooses its practice; each project can use a different service area.
// These are presentation guides, never a substitute for recorded project state.
export const WORKFLOWS={
 'event-styling':{name:'Event styling',project:'event',date:'Event date',place:'Venue / setting',intro:'A shared place for the brief, creative direction and every detail of the setting.',plan:'From first ideas to the final installation, follow the steps your studio has shared.',decision:'Choose the direction that feels right for your event.',guide:['Brief & references','Creative direction','Production & installation'],choiceFacts:['Installation size','Setting']},
 'event-planning':{name:'Event planning',project:'event',date:'Event date',place:'Venue / area',intro:'The people, schedule and decisions behind your gathering, all in one place.',plan:'Follow your event from the first brief through coordination and the day itself.',decision:'Make the choices that shape your event.',guide:['Event brief','Suppliers & schedule','Final coordination'],choiceFacts:['Location','Guest capacity']},
 'wedding-planning':{name:'Wedding planning',project:'wedding',date:'Wedding date',place:'Venue / area',intro:'The people, plans and decisions for your celebration, brought together.',plan:'Your planning steps, from the first conversation through to the day itself.',decision:'Make the choices that shape your celebration.',guide:['Planning brief','Key choices','Final coordination'],choiceFacts:['Setting','Guest capacity']},
 'floral-design':{name:'Floral design',project:'floral project',date:'Delivery / event date',place:'Delivery / installation',intro:'A home for your floral brief, references and the details of the arrangement.',plan:'See what is taking shape, what needs your input and what your florist is preparing.',decision:'Choose the floral direction that feels like yours.',guide:['Floral brief','Stem & arrangement direction','Preparation & delivery'],choiceFacts:['Season','Scale']},
 'balloon-styling':{name:'Balloon styling',project:'installation',date:'Installation / event date',place:'Installation venue',intro:'The installation brief, visual direction and practical details in one shared place.',plan:'Follow the installation from site details through design, preparation and setup.',decision:'Choose the installation direction that feels right for your event.',guide:['Site & dimensions','Design direction','Preparation & installation'],choiceFacts:['Size','Setup']},
 'interior-design':{name:'Interior design',project:'space',date:'Target date',place:'Property / room',intro:'A clear record of the spaces, ideas and choices behind your project.',plan:'Follow your space from discovery through design and delivery.',decision:'Choose the direction that belongs in your space.',guide:['Space & requirements','Design direction','Sourcing & installation'],choiceFacts:['Material','Lead time']},
 'creative-studio':{name:'Creative studio',project:'creative project',date:'Launch / delivery date',place:'Brand / location',intro:'The brief, references and feedback for your creative work in one place.',plan:'Follow the work from discovery through concept and delivery.',decision:'Choose the direction that fits your brief.',guide:['Discovery & brief','Concept & feedback','Production & delivery'],choiceFacts:['Deliverables','Format']},
 'bespoke-making':{name:'Bespoke making',project:'commission',date:'Delivery date',place:'Delivery / collection',intro:'A calm place to shape your commission and keep every detail in view.',plan:'See the work move from specification through making and handover.',decision:'Choose the details that make this piece yours.',guide:['Specification','Design & materials','Making & handover'],choiceFacts:['Material','Lead time']}
};
export const DEFAULT_WORKFLOW='event-styling';
const DEMO_COVERS={
 'event-styling':'/assets/candlelit-table.webp',
 'event-planning':'/assets/hospitality-studio.webp',
 'wedding-planning':'/assets/blush-celebration.webp',
 'floral-design':'/assets/sage-blush-florals.webp',
 'interior-design':'/assets/interiors-studio.webp',
 'creative-studio':'/assets/campaign-set.webp'
};
export const demoCoverFor=project=>project?.demo?DEMO_COVERS[project.brief?.workflowType||DEFAULT_WORKFLOW]||null:null;
export const workflowOptions=Object.entries(WORKFLOWS).map(([id,value])=>({id,label:value.name}));
export const isWorkflowId=value=>Object.hasOwn(WORKFLOWS,value);
const PROJECT_TYPES={
 'event-styling':['Private celebration','Wedding styling','Brand launch','Dinner or gathering','Venue installation','Something else'],
 'event-planning':['Private party','Corporate event','Milestone celebration','Community gathering','Something else'],
 'wedding-planning':['Full wedding planning','Partial planning','On-the-day coordination','Destination wedding','Something else'],
 'floral-design':['Wedding flowers','Event florals','Floral installation','Bespoke arrangement','Something else'],
 'balloon-styling':['Balloon installation','Backdrop or arch','Table or room styling','Celebration display','Something else'],
 'interior-design':['A single room','A whole home','Commercial space','Styling consultation','Something else'],
 'creative-studio':['Brand identity','Campaign or content','Art direction','Digital experience','Something else'],
 'bespoke-making':['Custom piece','Event commission','Small batch','Alteration or repair','Something else']
};
export const projectTypesFor=id=>PROJECT_TYPES[isWorkflowId(id)?id:DEFAULT_WORKFLOW];
const BRIEF_FIELDS={
 'event-styling':[{key:'guestCount',label:'Approximate guest count',hint:'A rough number is fine'},{key:'styledAreas',label:'What should be styled?',hint:'Tables, entrance, backdrop…'}],
 'event-planning':[{key:'guestCount',label:'Approximate guest count',hint:'A rough number is fine'},{key:'planningSupport',label:'What planning support do you need?',hint:'Venue, suppliers, schedule, coordination…'}],
 'wedding-planning':[{key:'guestCount',label:'Approximate guest count',hint:'A rough number is fine'},{key:'planningSupport',label:'Where would you like support?',hint:'Full planning, suppliers, coordination…'}],
 'floral-design':[{key:'floralAreas',label:'Where would you like flowers?',hint:'Ceremony, tables, reception…'},{key:'arrangementScale',label:'What scale feels right?',hint:'Intimate, abundant, sculptural…'}],
 'balloon-styling':[{key:'installationSize',label:'What size or space should we fill?',hint:'Wall width, ceiling height, or a rough estimate…'},{key:'siteConstraints',label:'Anything we should know about the site?',hint:'Access, setup time, fixings, indoor or outdoor…'}],
 'interior-design':[{key:'spaces',label:'Which spaces are involved?',hint:'Living room, kitchen, whole home…'},{key:'constraints',label:'What should we work around?',hint:'Measurements, existing pieces, access…'}],
 'creative-studio':[{key:'deliverables',label:'What needs to be delivered?',hint:'Identity, campaign, digital assets…'},{key:'channels',label:'Where will it appear?',hint:'Web, social, print, physical space…'}],
 'bespoke-making':[{key:'quantity',label:'How many pieces?',hint:'One piece, a matching set, a small batch…'},{key:'materials',label:'Materials or finish in mind?',hint:'Wood, linen, glazed ceramic…'}]
};
export const briefFieldsFor=id=>BRIEF_FIELDS[isWorkflowId(id)?id:DEFAULT_WORKFLOW];
export function workflowFor(studio,project){const id=project?.brief?.workflowType||studio?.branding?.profession||DEFAULT_WORKFLOW;return {id:isWorkflowId(id)?id:DEFAULT_WORKFLOW,...WORKFLOWS[isWorkflowId(id)?id:DEFAULT_WORKFLOW]};}
