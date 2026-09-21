import { PublicLinkInBioClient } from "./link-in-bio-client";

export default function PublicLinkInBioPage({ params }: { params: { slug: string } }) {
  return <PublicLinkInBioClient slug={params.slug} />;
}
