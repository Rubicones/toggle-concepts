"use client";

import dynamic from "next/dynamic";

const Preview = dynamic(() => import("./preview"), { ssr: false, loading: () => <p className="page-loading">Loading local player…</p> });
export default Preview;
