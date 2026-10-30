import type { Metadata } from "next";
import { MagicLinkConfirmation } from "@/components/studio/auth";

export const metadata: Metadata = { title: "Confirm sign-in — Toggle Studio", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ConfirmPage() { return <MagicLinkConfirmation/>; }
