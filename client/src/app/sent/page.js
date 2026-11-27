import ApplicationsWorkspace from "@/components/ApplicationsWorkspace";

export default function SentApplicationsPage() {
  return (
    <ApplicationsWorkspace
      fixedFilter="sent"
      showTabs={false}
      title="Sent Applications"
      description="Submitted applications where the send request was accepted, with message IDs, outcome tracking, and follow-up scheduling."
    />
  );
}
