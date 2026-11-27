import ApplicationsWorkspace from "@/components/ApplicationsWorkspace";

export default function QueuePage() {
  return (
    <ApplicationsWorkspace
      fixedFilter="queue_view"
      showTabs={false}
      title="Sending Queue"
      description="Approved emails waiting in queue or ready for immediate manual dispatch."
    />
  );
}
