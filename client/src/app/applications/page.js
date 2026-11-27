import ApplicationsWorkspace from "@/components/ApplicationsWorkspace";

export default function ApplicationsPage() {
  return (
    <ApplicationsWorkspace
      showTabs={true}
      title="Applications"
      description="Unified view across drafts, approved/queued emails, sent applications, follow-ups, and failures."
    />
  );
}
