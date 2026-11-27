import VacancyWorkspace from "@/components/VacancyWorkspace";

export default function PendingVacanciesPage() {
  return (
    <VacancyWorkspace
      scope="pending"
      title="Pending Vacancies"
      description="All actionable vacancies not yet sent or archived — including contact discovery, draft review, and portal applications."
    />
  );
}
