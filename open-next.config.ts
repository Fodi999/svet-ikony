import { defineCloudflareConfig } from '@opennextjs/cloudflare';

const config = defineCloudflareConfig();

export default {
  ...config,
  buildCommand: 'npm run next:build'
};
