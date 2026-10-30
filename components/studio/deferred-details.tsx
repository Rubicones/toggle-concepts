'use client';
import {Disclosure} from '@/components/ui/disclosure';
import { useState, type ReactNode } from 'react';

// Closed advanced panels should not mount data loaders or subscribe to changes.
export function DeferredDetails({summary,children,className}:{summary:string;children:ReactNode;className?:string}) {
  const [open,setOpen]=useState(false);
  return <Disclosure className={className} onToggle={event=>setOpen(event.currentTarget.open)}><summary>{summary}</summary>{open&&children}</Disclosure>;
}
