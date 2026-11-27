import ApplicationsWorkspace from "@/components/ApplicationsWorkspace";

export default function FailedApplicationsPage() {
  return (
    <ApplicationsWorkspace
      fixedFilter="failed"
      showTabs={false}
      title="Failed Applications"
      description="Failed or bounced sending attempts with error diagnostics. Review the draft or recipient before retrying."
    />
  );
}
