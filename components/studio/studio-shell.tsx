"use client";

import { createContext, Suspense, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, Command, HelpCircle, Images, LayoutGrid, Menu, Monitor, Search, Settings2, SlidersHorizontal, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { studioRequest } from "@/lib/shared-http";
import {usePendingSaves,discardPendingDraft} from "@/lib/use-persisted-draft";
import { reloadStudio,rememberStudioCampaign } from "@/lib/studio-store";
import { useStudio } from "@/lib/studio-store";
import { localCampaignSchema } from "@/packages/contracts/studio";

const nav = [
  { href: "/", label: "Campaigns", icon: LayoutGrid },
  { href: "/workspace", label: "Shared workspace", icon: LayoutGrid },
  { href: "/queue", label: "Queue & devices", icon: Monitor },
  { href: "/models", label: "Models & agents", icon: SlidersHorizontal },
  { href: "/media", label: "Media library", icon: Images },
  { href: "/settings", label: "Settings", icon: Settings2 },
];
const Actions = createContext({ newCampaign: () => {} });
export function useStudioActions() { return useContext(Actions); }
export function Wordmark() { return <span className="wordmark" aria-label="Toggle"><span>T</span><span className="wordmark-toggle" /><span>GGLE</span></span>; }

export function StudioShell({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="studio-loading" role="status">Loading your workspace…</div>}><Shell>{children}</Shell></Suspense>;
}
function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, issue } = useStudio();

  const saves=usePendingSaves(),pendingCreate=useRef<{signature:string;id:string}|null>(null);
  useEffect(()=>{const protect=(e:BeforeUnloadEvent)=>{if(saves.pending){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",protect);return()=>window.removeEventListener("beforeunload",protect);},[saves.pending]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [formError, setFormError] = useState("");
  const [creating,setCreating]=useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen((open) => !open); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(data.reducedMotion); }, [data.reducedMotion]);
  const active = nav.find((item) => item.href === "/" ? pathname === "/" || pathname.startsWith("/campaigns") : pathname.startsWith(item.href));
  const title = pathname.startsWith("/preview") ? "Render lab" : active?.label ?? "Workspace";
  const campaigns = data.campaigns;
  const links = [...nav, { href: "/preview", label: "Render lab", icon: Video },
    ...campaigns.map((c) => ({ href: `/campaigns/${c.id}`, label: `${c.brand} · ${c.name}`, icon: LayoutGrid }))]
    .filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  const navigation = (close: () => void) => <>
    <Link href="/" className="brand-link" onClick={close}><Wordmark /><span className="brand-caption">CREATIVE STUDIO</span></Link>
    <button className="workspace-switch" onClick={() => { close(); router.push("/settings"); }}><span className="workspace-avatar">T.</span><span>{data.workspaceName}<small>Shared workspace</small></span><ChevronDown size={14} /></button>
    <p className="nav-label">WORKSPACE</p>
    <nav aria-label="Workspace navigation">{nav.map(({ href, label, icon: Icon }) => <Link href={href} key={href} onClick={close} className={`nav-link ${active?.href === href ? "active" : ""}`} aria-current={active?.href === href ? "page" : undefined}><Icon size={18} strokeWidth={1.65} />{label}{href === "/" && <span className="nav-count">{campaigns.length}</span>}</Link>)}</nav>
    <p className="nav-label nav-label-tools">TOOLS</p>
    <Link className={`nav-link ${pathname.startsWith("/preview") ? "active" : ""}`} href="/preview" onClick={close}><Video size={18} strokeWidth={1.65} />Render lab<ArrowUpRight size={14} className="nav-end" /></Link>
    <div className="sidebar-bottom">
      <div className="local-note"><span className="local-note-icon"><Monitor size={20} /></span><strong>Your work. Your machine.</strong><p>Preview and render locally.<br />Keep the studio in your hands.</p><Link href="/queue" onClick={close}>Check local setup <ArrowRight size={14} /></Link></div>
      <button className="sidebar-help" onClick={() => { close(); setHelpOpen(true); }}><HelpCircle size={17} />Getting started<ArrowUpRight size={14} /></button>
      <div className="studio-profile"><span className="profile-avatar">ST</span><span><strong>Studio team</strong><small>Shared Supabase workspace</small></span><span className="profile-check"><Check size={13} /></span></div>
    </div>
  </>;
  if (pathname.startsWith("/portal") || pathname === "/login" || pathname === "/auth/confirm") return <div className="access-shell"><header><Link href="/"><Wordmark/></Link><span>{pathname.startsWith("/portal") ? "CLIENT SPACE" : "WORKSPACE ACCESS"}</span></header><main id="main-content">{children}</main><footer>TOGGLE STUDIO · Considered creative. Every version.</footer></div>;
  return <Actions.Provider value={{ newCampaign: () => { setFormError(""); setCreateOpen(true); } }}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="studio-sidebar">{navigation(() => {})}</aside>
    <div className="studio-body">
      <header className="studio-topbar">
        <Button className="mobile-menu" variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></Button>
        <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><strong>{title}</strong></div>
        <div className="topbar-actions"><button className="global-search" aria-label="Search workspace" onClick={() => setSearchOpen(true)}><Search size={16} /><span>Search anything</span><kbd><Command size={11} /> K</kbd></button><Badge variant="blue"><span className="status-dot" />Shared access</Badge><Link className="worker-indicator" href="/queue">Runs & activity</Link><button className="help-icon" aria-label="Open help" onClick={() => setHelpOpen(true)}><HelpCircle size={19} /></button><span className="topbar-avatar" aria-label="Studio team">ST</span></div>
      </header>
      <main id="main-content" className="studio-content" tabIndex={-1}>
        {saves.errors.map(e=><p key={e.key} className="notice notice-error" role="alert"><Link href={e.href}>{e.label} has unsaved changes</Link>: {e.message} <Button type="button" variant="outline" onClick={()=>discardPendingDraft(e.key)}>Discard unsaved edits</Button></p>)}{saves.pending>0&&!saves.errors.length&&<p className="notice" role="status">Saving campaign changes to Supabase…</p>}{issue && <p className="notice notice-error" role="alert">{issue}</p>}{children}
      </main>
      <footer className="studio-footer"><span>TOGGLE STUDIO</span><span>Made for good ideas. Built for every version.</span><span>Shared Supabase workspace</span></footer>
    </div>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}><DialogContent className="navigation-drawer"><DialogTitle className="sr-only">Workspace navigation</DialogTitle><DialogDescription className="sr-only">Navigate your local creative studio.</DialogDescription>{navigation(() => setMenuOpen(false))}</DialogContent></Dialog>
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent className="search-dialog"><DialogTitle>Find your next step</DialogTitle><DialogDescription>Search campaigns and workspace pages.</DialogDescription><label className="search-field"><Search size={18} /><input autoFocus placeholder="Search campaigns, media, settings…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search campaigns and pages" /></label><div className="search-results">{links.length ? links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setSearchOpen(false)}><Icon size={17} /><span>{label}</span><ArrowUpRight size={16} /></Link>) : <p className="muted">No matches. Try a campaign or page name.</p>}</div></DialogContent></Dialog>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent><span className="eyebrow">A GOOD PLACE TO START</span><DialogTitle>Your studio, at a glance.</DialogTitle><DialogDescription>Create campaigns, configure agents, and track real work in one shared space.</DialogDescription><div className="help-steps">{[{ n: "01", title: "Explore a campaign", text: "Open a campaign to edit its brief and brand kit.", href: "/" }, { n: "02", title: "Try the render lab", text: "Play the verified local composition and inspect the 3D probe.", href: "/preview" }, { n: "03", title: "Review agent runs", text: "Review persisted runs and agent outputs.", href: "/queue" }].map((step) => <Link key={step.n} href={step.href} onClick={() => setHelpOpen(false)}><span>{step.n}</span><div><strong>{step.title}</strong><p>{step.text}</p></div><ArrowUpRight size={18} /></Link>)}</div></DialogContent></Dialog>
    <Dialog open={createOpen} onOpenChange={open=>{if(!creating)setCreateOpen(open);}}><DialogContent><span className="eyebrow">ROOM FOR YOUR NEXT IDEA</span><DialogTitle>New campaign</DialogTitle><DialogDescription>Create a shared campaign. Generation starts only when you run an agent.</DialogDescription>
      <form className="studio-form" onSubmit={async(event) => {
        event.preventDefault(); const fields = new FormData(event.currentTarget);
        const parsed = localCampaignSchema.safeParse({ schemaVersion: "1.0", id: `local-${crypto.randomUUID()}`, name: fields.get("name"), brand: fields.get("brand"), goal: fields.get("goal"), createdAt: new Date().toISOString() });
        if (!parsed.success) { setFormError("Add a campaign name and brand, within the stated limits."); return; }
        setCreating(true);const values={name:parsed.data.name,brand:parsed.data.brand,goal:parsed.data.goal},signature=JSON.stringify(values);if(pendingCreate.current?.signature!==signature)pendingCreate.current={signature,id:crypto.randomUUID()};try {const result=await studioRequest<{id:string;campaign:import("@/packages/contracts/shared").SharedCampaign}>("/api/studio/campaigns","POST",{...values,requestId:pendingCreate.current.id});rememberStudioCampaign(result.campaign);pendingCreate.current=null;await reloadStudio();setCreateOpen(false);router.push(`/campaigns/${result.id}`);}catch(error){setFormError(error instanceof Error?error.message:"Could not create campaign.");}finally{setCreating(false);}

      }}><label>Campaign name<input name="name" placeholder="e.g. A brighter everyday" required maxLength={80} /></label><label>Brand<input name="brand" placeholder="Your brand or client" required maxLength={60} /></label><label>A little context <span className="muted">(optional)</span><textarea name="goal" placeholder="What would you like this campaign to do?" maxLength={1200} rows={3} /></label>{formError && <p role="alert" className="form-error">{formError}</p>}<div className="form-footer"><span>Saved to Supabase when created</span><Button type="submit" disabled={creating}>{creating?"Creating…":"Create campaign"}<ArrowRight size={16} /></Button></div></form>
    </DialogContent></Dialog>
  </Actions.Provider>;
}
