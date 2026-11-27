import ApplicationsWorkspace from "@/components/ApplicationsWorkspace";

export default function DraftsPage() {
  return (
    <ApplicationsWorkspace
      fixedFilter="draft"
      showTabs={false}
      title="Email Drafts"
      description="Generated application drafts awaiting your review, edits, and explicit approval before entering the sending queue."
    />
  );
}
