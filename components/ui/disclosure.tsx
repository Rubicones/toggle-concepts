import type {DetailsHTMLAttributes} from 'react';
/** Native keyboard semantics, consistent studio styling; content may still be deferred. */
export function Disclosure({className,children,...props}:DetailsHTMLAttributes<HTMLDetailsElement>){return <details {...props} className={`studio-disclosure ${className??''}`}>{children}</details>;}
