import { prisma } from "./prisma";

export function listMetricsForCampaign(companyId: string, campaignId: string) {
  return prisma.advertisingCampaignMetric.findMany({
    where: { companyId, campaignId },
    orderBy: { recordDate: "desc" },
  });
}

export async function patchAdvertisingCampaignMetric(
  companyId: string,
  metricId: string,
  data: { metaLinkClicks?: number | null; metaConversationsStarted?: number | null; shopifySessions?: number | null },
) {
  const row = await prisma.advertisingCampaignMetric.findFirst({ where: { id: metricId, companyId } });
  if (!row) return null;
  return prisma.advertisingCampaignMetric.update({
    where: { id: metricId },
    data: {
      ...(data.metaLinkClicks !== undefined ? { metaLinkClicks: data.metaLinkClicks } : {}),
      ...(data.metaConversationsStarted !== undefined ? { metaConversationsStarted: data.metaConversationsStarted } : {}),
      ...(data.shopifySessions !== undefined ? { shopifySessions: data.shopifySessions } : {}),
    },
  });
}
