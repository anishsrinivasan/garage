import { permanentRedirect } from "next/navigation";

export default async function GarageRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<never> {
  const { slug } = await params;
  permanentRedirect(`/sources/${slug}`);
}
