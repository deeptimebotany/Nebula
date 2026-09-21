import { RapportClient } from "./rapport-client";

export default function RapportPage({ params }: { params: { token: string } }) {
  return <RapportClient token={params.token} />;
}
