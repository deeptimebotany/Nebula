import { ApprovalClient } from "./approval-client";

export default function ApprovalPage({ params }: { params: { token: string } }) {
  return <ApprovalClient token={params.token} />;
}
