import { CalendrierClient } from "./calendrier-client";

export default function CalendrierPage({ params }: { params: { token: string } }) {
  return <CalendrierClient token={params.token} />;
}
