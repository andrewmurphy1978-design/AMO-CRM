import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page in this app is dynamic (personalized, auth-gated data), so
// there's nothing to gain from Next's ISR/static caching layer here — the
// default (no incremental cache) keeps the Cloudflare setup simpler (no R2
// bucket to create). Revisit this if static/ISR pages get added later:
// https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig();
