import { redirect } from "next/navigation";

// Les guides de la Communauté ont été retirés (10/10/2026, demande de
// Lucas) : les questions de prise en main passent par « Demander à Nebula »
// et ses suggestions. Un ancien lien vers un guide mène à la Communauté.
export default function GuideRetired() {
  redirect("/community");
}
