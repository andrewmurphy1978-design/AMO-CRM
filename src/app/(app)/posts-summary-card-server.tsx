import { getPostsOverview } from "@/lib/posts-overview";
import PostsSummaryCard, { type PostsSummaryLabels } from "./posts-summary-card";

// Reads the posts overview (Make's queue is a live call, so this sits inside a Suspense boundary on the Dashboard).
export default async function PostsSummaryCardServer({ labels }: { labels: PostsSummaryLabels }) {
  const o = await getPostsOverview();
  return <PostsSummaryCard counts={{ queued: o.makeQueued + o.bufferQueued, make: o.makeQueued, buffer: o.bufferQueued, sent: o.sentLast7, failed: o.failedInMake }} labels={labels} />;
}
