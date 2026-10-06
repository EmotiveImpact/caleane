import {DEFAULT_WORKFLOW,WORKFLOWS,isWorkflowId,projectTypesFor,workflowOptions} from './workflows.js';

// Ready-made starting points for each kind of work: saved messages, price list
// items, a contract and an enquiry form. Nothing here is live until the owner
// adds it, and every starter can be edited once it is added.

// Older, narrower kinds of work borrow the gallery of the group they now sit in.
const GALLERY_FOR={'event-planning':'event-styling','floral-design':'event-styling','balloon-styling':'event-styling'};
export const starterKinds=workflowOptions;
export const starterKindFor=id=>GALLERY_FOR[id]||(isWorkflowId(id)?id:DEFAULT_WORKFLOW);

const message=(name,category,body)=>({name,category,body});
const price=(name,unitAmount,unit,category,description)=>({name,unitAmount,unit,category,description,currency:'GBP'});
const question=(id,label,type,extra={})=>({id:`q-${id}`,label,type,required:false,options:[],...extra});
const heardAbout=question('heard-about','How did you hear about us?','choice',{options:['Instagram','A friend or past client','A venue or supplier','Search','Somewhere else']});

const STARTERS={
 'event-styling':{
  summary:'Styling, installations and hire for parties, launches and gatherings.',
  messages:[
   message('Venue details request','Enquiries','Hi {client_first_name},\n\nThank you for thinking of us for {project_title}. So we can plan the styling properly, could you share a few venue details?\n\n- The venue name and the rooms we will be working in\n- Access times for setting up and clearing away\n- Any rules the venue has about candles, fixings or deliveries\n\nOnce we have these, we will put together a first direction for you.\n\n{studio_name}'),
   message('Design direction ready','Proposals','Hi {client_first_name},\n\nThe design direction for {project_title} is ready in your project space. It covers the palette, the key pieces and how each area will come together.\n\nHave a look when you have a quiet moment and mark anything you would like to change. We can talk it through on a call if that is easier: {booking_link}\n\n{studio_name}'),
   message('Installation day plan','Delivery','Hi {client_first_name},\n\nHere is how {project_date} will run on our side. We will arrive at the agreed access time, set up each area in turn and walk you or your venue contact through everything before guests arrive.\n\nCould you confirm the name and number of the person we should ask for on the day?\n\n{studio_name}')
  ],
  prices:[
   price('Styling consultation',15000,'each','Consultations','A first meeting to walk through the space, the occasion and the feeling you want to create.'),
   price('Table styling',8500,'item','Styling','Linen, candles, tableware and small florals for one guest table.'),
   price('Statement installation',120000,'each','Installations','A focal piece such as an entrance arch, backdrop or ceiling feature, designed for your venue.'),
   price('Delivery, setup and collection',9500,'each','Logistics','Our team delivers, installs and later collects every piece.')
  ],
  contract:{title:'Event styling agreement',clauses:[
   ['Venue access','The client will arrange access to the venue for setting up and clearing away at the times agreed in the project space. If access is delayed or cut short, we will do our best within the time available, and extra time on site may be charged at our day rate.'],
   ['Hire items','Hire items remain our property. The client is responsible for them from installation until collection. Missing or damaged items will be charged at their replacement cost, and we will share photos and costs before invoicing.'],
   ['Safety and venue rules','We will follow the venue’s rules on fixings, open flames and fire exits. Where a venue rule changes the design, we will agree an alternative with the client before the event.']
  ]},
  form:{name:'Event enquiry',title:'Tell us about your event.',description:'A few details about the occasion, the venue and the feeling you have in mind. It takes about three minutes.',questions:[
   question('guest-count','Roughly how many guests?','number',{placeholder:'An estimate is fine'}),
   question('styled-areas','Which areas should we style?','multi',{options:['Entrance','Tables','Backdrop or stage','Ceiling or overhead','Outdoor spaces']}),
   question('venue-confirmed','Is your venue confirmed?','choice',{required:true,options:['Yes','Not yet']}),
   question('venue-access','When can we get into the venue to set up?','long',{showWhen:{questionId:'q-venue-confirmed',equals:'Yes'},placeholder:'For example, from 10am on the day'}),
   heardAbout
  ]}
 },
 'wedding-planning':{
  summary:'Planning, coordination and styling for weddings and celebrations.',
  messages:[
   message('Congratulations and next steps','Enquiries','Hi {client_first_name},\n\nCongratulations, and thank you for getting in touch. We would love to hear more about your plans for {project_date}.\n\nThe easiest next step is a relaxed call where you can tell us what matters most to you both. Pick a time that suits you here: {booking_link}\n\n{studio_name}'),
   message('Planning meeting notes','Planning','Hi {client_first_name},\n\nThank you for your time today. I have added the notes from our planning meeting to your project space, along with the decisions still to make and who is looking after each one.\n\nIf anything looks different from how you remember it, reply here and we will update it.\n\n{studio_name}'),
   message('Final timings check','Delivery','Hi {client_first_name},\n\nWith {project_date} getting close, could you look over the running order in your project space and confirm:\n\n- Ceremony and reception timings\n- Final guest numbers and any dietary needs\n- Who we should contact on the day if we cannot reach you\n\nThen you can leave the rest to us.\n\n{studio_name}')
  ],
  prices:[
   price('Full wedding planning',350000,'each','Planning','From the first conversation to the last dance, including venue and supplier search, budget tracking and coordination on the day.'),
   price('Partial planning',180000,'each','Planning','For couples who have started planning and would like help bringing it together, from about six months out.'),
   price('On-the-day coordination',95000,'each','Coordination','We take over the final month of detail and run the day so you and your families can be present.'),
   price('Additional planning meeting',12000,'hour','Planning','Extra time for site visits, tastings or supplier meetings beyond those included.')
  ],
  contract:{title:'Wedding planning agreement',clauses:[
   ['The wedding day','Our services cover the wedding date and venue named in the project space. On the day, our coordinator will be present for the hours agreed in the accepted proposal.'],
   ['Suppliers','We recommend and coordinate suppliers, but the client contracts with each supplier directly and pays them under their own terms. We are not responsible for a supplier’s failure to deliver, although we will help find a replacement where we can.'],
   ['Moving the date','If the client moves the wedding date, we will transfer the booking to the new date where we are free. Payments already made carry over, and any extra work caused by the move will be quoted before it begins.']
  ]},
  form:{name:'Wedding enquiry',title:'Tell us about your wedding.',description:'Share what you know so far. Nothing needs to be decided yet.',questions:[
   question('guest-count','Roughly how many guests?','number',{placeholder:'An estimate is fine'}),
   question('same-venue','Will the ceremony and reception be at the same place?','choice',{options:['Yes','No','Not sure yet']}),
   question('help-with','Where would you like our help?','multi',{required:true,options:['Full planning','Finding a venue','Choosing suppliers','Styling and flowers','Coordination on the day']}),
   question('budget-range','What is your overall wedding budget?','choice',{options:['Under £15,000','£15,000 to £30,000','£30,000 to £60,000','Over £60,000','Still working it out']}),
   heardAbout
  ]}
 },
 'interior-design':{
  summary:'Rooms, homes and commercial spaces, from survey to installation.',
  messages:[
   message('Site visit arranged','Enquiries','Hi {client_first_name},\n\nThank you for asking us to look at {project_title}. We will measure up and photograph each space during the site visit, so it helps if every room we are working on is accessible.\n\nIf you have floor plans, photos of pieces you are keeping or images you love, add them to your project space before we arrive.\n\n{studio_name}'),
   message('Concept boards shared','Proposals','Hi {client_first_name},\n\nYour concept boards for {project_title} are ready in your project space. They show the palette, materials and key pieces for each room.\n\nTake your time with them. Mark anything you love or would rather avoid, and we will refine the scheme from there.\n\n{studio_name}'),
   message('Order deposit due','Billing','Hi {client_first_name},\n\nThe furniture and finishes for {project_title} are ready to order. Most suppliers ask for payment before they start production, so we have issued an invoice for the order deposit in your project space.\n\nOnce it is paid, we will place the orders and share the expected delivery dates.\n\n{studio_name}')
  ],
  prices:[
   price('Initial consultation',18000,'each','Consultations','A visit to talk through the space, how you use it and what you would like to change.'),
   price('Concept design, per room',95000,'item','Design','Mood board, palette, layout and a list of key pieces for one room.'),
   price('Design time',8500,'hour','Design','Further design work, revisions and specification beyond the agreed concept.'),
   price('Installation and styling day',65000,'day','Installation','A day on site receiving deliveries, placing furniture and styling the finished room.')
  ],
  contract:{title:'Interior design agreement',clauses:[
   ['Site access and measurements','The client will give us reasonable access to the property for surveys, deliveries and installation. Our designs rely on the measurements taken at the survey, so we will re-measure before ordering anything made to size.'],
   ['Orders and suppliers','Furniture, fabrics and finishes are ordered in the client’s name or paid for in advance. Once an order is placed, supplier cancellation terms apply, and made-to-order items usually cannot be returned. Lead times are set by the supplier and we will keep the client updated on any delays.'],
   ['Building work','Where the project needs trades or building work, the client contracts with those trades directly. We can coordinate their timing with our work but are not responsible for the quality of their work or for building regulations.']
  ]},
  form:{name:'Interiors enquiry',title:'Tell us about your space.',description:'A little about the rooms, the timing and the feel you are after.',questions:[
   question('rooms','Which spaces are involved?','multi',{required:true,options:['Living room','Kitchen','Bedroom','Bathroom','Whole home','Commercial space']}),
   question('property-status','Where are you with the property?','choice',{options:['Living there now','Just bought it','Renovating','Commercial premises']}),
   question('keep-pieces','Are there pieces you would like to keep?','long',{placeholder:'Furniture, art or heirlooms we should design around'}),
   heardAbout
  ]}
 },
 'creative-studio':{
  summary:'Brand identity, campaigns, art direction and digital work.',
  messages:[
   message('Discovery call follow-up','Enquiries','Hi {client_first_name},\n\nThank you for walking me through {project_title}. I have added a short summary of what we discussed to your project space, including the goals, audience and the deliverables we talked about.\n\nIf that captures it, the proposal will follow shortly.\n\n{studio_name}'),
   message('Concepts ready for review','Review','Hi {client_first_name},\n\nThe first concepts for {project_title} are ready in your project space. Each one has a short note on the thinking behind it.\n\nWhen you review them, it helps to say what is working as well as what is not. Your feedback on this round shapes the direction we take forward.\n\n{studio_name}'),
   message('Final files delivered','Delivery','Hi {client_first_name},\n\nThe final files for {project_title} are in your project space, organised by format and use. You will also find a short guide on how to use them consistently.\n\nIt has been a pleasure working on this with you.\n\n{studio_name}')
  ],
  prices:[
   price('Discovery workshop',45000,'each','Strategy','A half-day session to agree goals, audience, positioning and what success looks like.'),
   price('Brand identity',320000,'each','Identity','Logo, colour palette, typography and a short brand guide, with two rounds of revisions.'),
   price('Additional revision round',30000,'each','Revisions','One further round of changes beyond those included.'),
   price('Design day rate',48000,'day','Design','Design time for campaign assets, artwork and digital work.')
  ],
  contract:{title:'Creative services agreement',clauses:[
   ['Revisions','The fee includes two rounds of revisions at each review stage. Further rounds, or changes to the agreed brief, will be quoted before we carry them out.'],
   ['Ownership and licence','Once the final invoice is paid in full, the client owns the final approved artwork. Concepts that were not chosen, working files and our own tools and methods remain ours. We may show the work in our portfolio unless the client asks us not to in writing.'],
   ['Third-party materials','Fonts, stock images and other licensed materials are used under their own licences. We will tell the client which licences they need and their cost before they are purchased.']
  ]},
  form:{name:'Creative project enquiry',title:'Tell us about your project.',description:'What you need, where it will live and when you need it.',questions:[
   question('deliverables','What do you need?','multi',{required:true,options:['Brand identity','Campaign','Website or digital','Packaging','Art direction','Something else']}),
   question('channels','Where will the work appear?','multi',{options:['Website','Social media','Print','Physical space','Video']}),
   question('existing-brand','Do you already have brand guidelines?','choice',{options:['Yes','Some, but out of date','No']}),
   question('launch-date','When do you need it by?','date'),
   heardAbout
  ]}
 },
 'photo-film':{
  summary:'Photography and film for weddings, portraits, brands and products.',
  messages:[
   message('Shot list request','Planning','Hi {client_first_name},\n\nTo plan {project_title}, it would help to have a shot list. Add the moments, people and details you would most like captured to your project space, along with any images whose style you love.\n\nWe will build the plan for the day around it.\n\n{studio_name}'),
   message('Shoot day reminder','Delivery','Hi {client_first_name},\n\nJust a reminder that we are shooting on {project_date}. We will arrive at the time agreed in your project space.\n\nIf the location, timings or contacts have changed, reply here and we will adjust the plan.\n\n{studio_name}'),
   message('Your gallery is ready','Delivery','Hi {client_first_name},\n\nYour images from {project_title} are ready. You can view and download them from your project space.\n\nIf you would like prints, an album or extra edits, reply here and we will put together the options.\n\n{studio_name}')
  ],
  prices:[
   price('Half-day shoot',65000,'each','Shoots','Up to four hours of coverage with edited images delivered online.'),
   price('Full-day shoot',110000,'each','Shoots','Up to eight hours of coverage with edited images delivered online.'),
   price('Additional edited image',1500,'item','Editing','Further images edited in the same style, beyond those included.'),
   price('Short film edit',85000,'each','Film','A two to three minute edit with licensed music.')
  ],
  contract:{title:'Photography and film agreement',clauses:[
   ['Coverage','We will cover the date, hours and locations set out in the accepted proposal. Extra time on the day can be added at our hourly rate if the client asks for it.'],
   ['Selection and delivery','We choose and edit the final images in our own style and deliver them online within the time set out in the proposal. Unedited files are not included.'],
   ['Use of images','The client may use the delivered images for the purposes agreed in the proposal. Copyright stays with us, and we may use selected images to show our work unless the client asks us not to in writing.'],
   ['Illness and equipment','We carry backup equipment. If illness or an emergency stops us attending, we will do our best to arrange a suitable replacement. If we cannot, we will refund all payments for the affected date.']
  ]},
  form:{name:'Shoot enquiry',title:'Tell us about your shoot.',description:'What you would like captured, where and how the work will be used.',questions:[
   question('coverage','What would you like us to capture?','multi',{required:true,options:['A wedding or event','Portraits','Products','Behind the scenes','A short film']}),
   question('usage','How will the work be used?','choice',{options:['Personal','Website and social','Advertising','Not sure yet']}),
   question('hours','Roughly how many hours of coverage?','number'),
   heardAbout
  ]}
 },
 'bespoke-making':{
  summary:'Commissions, custom pieces and small batches made to order.',
  messages:[
   message('Specification confirmed','Planning','Hi {client_first_name},\n\nThe specification for {project_title} is in your project space, with the dimensions, materials and finish we agreed.\n\nPlease check it carefully and approve it there. Once you have, we will order materials and book in the making.\n\n{studio_name}'),
   message('Making has started','Progress','Hi {client_first_name},\n\nWork on {project_title} has started. We will add progress photos to your project space as the piece takes shape, so you can see it come together.\n\n{studio_name}'),
   message('Ready for collection','Delivery','Hi {client_first_name},\n\n{project_title} is finished and ready for you. Reply here to arrange collection or delivery, and we will include care notes so it lasts.\n\n{studio_name}')
  ],
  prices:[
   price('Design consultation',9000,'each','Design','A conversation and sketches to agree the piece, its size and the materials.'),
   price('Sample or test piece',12000,'each','Design','A small sample of the material or finish so you can see and handle it before we begin.'),
   price('Making time',32000,'day','Making','Time in the workshop making your piece.'),
   price('Local delivery',4500,'each','Delivery','Careful delivery within our local area.')
  ],
  contract:{title:'Commission agreement',clauses:[
   ['Specification','We will make the piece to the specification approved in the project space. Changes after approval may change the price and timing, and we will confirm both before making them.'],
   ['Materials','Natural materials vary in grain, colour and texture, so the finished piece may differ slightly from samples. These differences are part of the character of handmade work and are not treated as faults.'],
   ['Collection and storage','We will let the client know when the piece is ready. If it is not collected or delivered within 30 days, we may charge a reasonable storage fee.']
  ]},
  form:{name:'Commission enquiry',title:'Tell us about the piece.',description:'What you would like made, roughly how big and when you need it.',questions:[
   question('quantity','How many pieces?','choice',{required:true,options:['One piece','A matching set','A small batch']}),
   question('materials','Any materials or finish in mind?','long',{placeholder:'Wood, linen, glazed ceramic…'}),
   question('dimensions','Roughly what size?','text',{placeholder:'Height, width and depth if you know them'}),
   heardAbout
  ]}
 },
 'general':{
  summary:'A flexible set for any creative work that does not fit the other groups.',
  messages:[
   message('A few questions first','Enquiries','Hi {client_first_name},\n\nThank you for getting in touch about {project_title}. Before we put a proposal together, could you tell us a little more about:\n\n- What you would like made\n- When you need it\n- Roughly what budget you have in mind\n\nOr book a short call if it is easier to talk: {booking_link}\n\n{studio_name}'),
   message('Progress update','Progress','Hi {client_first_name},\n\nA quick update on {project_title}. The latest work is in your project space, along with anything we need from you to keep things moving.\n\n{studio_name}'),
   message('Project wrapped','Follow-up','Hi {client_first_name},\n\n{project_title} is complete, and everything is saved in your project space for you to come back to.\n\nThank you for working with us. If you have a moment, we would love to hear how you found it.\n\n{studio_name}')
  ],
  prices:[
   price('Consultation',12000,'each','Consultations','A first conversation to understand the work and agree next steps.'),
   price('Day rate',40000,'day','Time','A full day working on your project.'),
   price('Hourly rate',6000,'hour','Time','Time for smaller tasks, changes and meetings.')
  ],
  contract:{title:'Services agreement',clauses:[
   ['Approvals','We will ask the client to approve the work at the stages set out in the proposal. Approval in the project space counts as written approval, and changes after approval may be charged.']
  ]},
  form:{name:'Project enquiry',title:'Tell us about your project.',description:'A few details so we can come back with the right next step.',questions:[
   question('deliverables','What would you like us to make?','long',{required:true,placeholder:'A rough idea is fine'}),
   question('timing','When do you need it?','date'),
   heardAbout
  ]}
 }
};

export function starterKit(kind){
 const id=starterKindFor(kind);
 return {id,name:WORKFLOWS[id].name,...STARTERS[id]};
}

const escapeHtml=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]);

// The shared clauses come first and last; each kind of work adds its own in the middle.
export function starterContract(kind,{studioName='The studio'}={}){
 const kit=starterKit(kind),studio=studioName;
 const sections=[
  ['Who this agreement is between',`This agreement is between ${studio} (“we”, “us”) and the client named in the project space (“the client”). It covers the work described in the accepted proposal for this project.`],
  ['Fees and payment','The fee is set out in the accepted proposal. A deposit of [deposit percentage]% is due to secure the date or start the work, and the balance is due as shown in the payment plan. The deposit covers time we set aside and work we begin straight away, so it cannot be refunded.'],
  ...kit.contract.clauses,
  ['Changes to the work','Either side can ask for changes. We will confirm any change to the price or timing in writing before carrying it out.'],
  ['Cancellation','The client can cancel by telling us in writing. Payments already made are kept, and if the client cancels within [number] days of the project date, the full fee is due. If we need to cancel, we will refund everything the client has paid.'],
  ['Liability','We take care in everything we do. Our total liability under this agreement is limited to the fees paid, and we are not liable for indirect losses. Nothing here limits liability that cannot be limited by law.'],
  ['Personal information','We use the client’s details only to deliver this work and keep them securely, as described in our privacy notice.'],
  ['Accepting this agreement','By accepting this version in the project space, the client confirms they have read and agree to these terms. This agreement is governed by the law of England and Wales.']
 ];
 return {title:kit.contract.title,termsHtml:sections.map(([heading,body],index)=>`<h3>${index+1}. ${escapeHtml(heading)}</h3><p>${escapeHtml(body)}</p>`).join('')};
}

// A draft definition for the existing enquiry form engine. The studio reviews
// and publishes it in Forms; the gallery never publishes a form itself.
export function starterFormDefinition(kind,{accent='#202326',logoUrl=''}={}){
 const kit=starterKit(kind);
 return {name:kit.form.name,title:kit.form.title,description:kit.form.description,profession:kit.id,projectTypes:projectTypesFor(kit.id),accent,logoUrl,layout:'steps',questions:kit.form.questions.map(item=>({...item,options:[...item.options]}))};
}
export const starterFormSlug=kind=>`${starterKindFor(kind)==='general'?'project':starterKindFor(kind)}-enquiry`;
