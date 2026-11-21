export default function manifest() {
  return {
    name: "ApplyFlow - Job Application Manager",
    short_name: "ApplyFlow",
    description:
      "Automate job applications with grounded AI email drafting, resume management, and application tracking.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#09090b",
    theme_color: "#4f46e5",
    categories: ["productivity", "business", "utilities"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Job Leads",
        short_name: "Jobs",
        description: "View and manage all job openings",
        url: "/",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
      {
        name: "Applications",
        short_name: "Applications",
        description: "Review drafts, queue, and sent applications",
        url: "/applications",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
      {
        name: "Resumes",
        short_name: "Resumes",
        description: "Manage resumes and preview extracted text",
        url: "/resumes",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
      {
        name: "Analytics",
        short_name: "Analytics",
        description: "Check application metrics and response rates",
        url: "/analytics",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
    ],
  };
}
