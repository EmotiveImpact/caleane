// Adapted from the supplied Ætheria Admin Card primitives.
// Utility classes are mapped to scoped CSS so this package stays framework independent.
import React from 'react';
export const Card=React.forwardRef(function Card({className='',children,...props},ref){return <section ref={ref} className={'ae-card '+className} {...props}>{children}</section>});
export const CardHeader=({children,...props})=><header className="ae-card-header" {...props}>{children}</header>;
export const CardContent=({children,...props})=><div className="ae-card-content" {...props}>{children}</div>;
