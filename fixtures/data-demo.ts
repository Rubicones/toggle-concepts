// Stable demo ownership IDs; user IDs/passwords come from local Auth, never source.
export const demoData = {
  tenant: "10000000-0000-4000-8000-000000000001", otherTenant: "10000000-0000-4000-8000-000000000002",
  campaign: "20000000-0000-4000-8000-000000000001", privateCampaign: "20000000-0000-4000-8000-000000000002", otherCampaign: "20000000-0000-4000-8000-000000000003",
  emails: { producer: "producer@toggle.local", client: "client@toggle.local", director: "director@toggle.local", stranger: "stranger@toggle.local", other: "other@toggle.local", worker: "worker@toggle.local" },
} as const;
