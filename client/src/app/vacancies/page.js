import VacancyWorkspace from "@/components/VacancyWorkspace";

export default function AllVacanciesPage() {
  return (
    <VacancyWorkspace
      scope="all"
      title="All Vacancies"
      description="Complete vacancy database across pending, queued, sent, failed, portal-required, and archived records."
    />
  );
}
