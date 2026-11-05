import { readFileSync } from 'node:fs';

// These host hints choose a visual theme, not an authenticated machine identity.
// Containers can hide DMI; an explicit setting always overrides detection.
export function cloudProvider(env = process.env, { platform = process.platform, readFile = readFileSync } = {}) {
  const setting = (env.CLOUD_PROVIDER ?? 'auto').trim().toLowerCase() || 'auto';
  if (!['auto', 'default', 'aws', 'gcp', 'onprem'].includes(setting)) {
    throw new Error('CLOUD_PROVIDER must be auto, default, aws, gcp, or onprem');
  }
  if (setting !== 'auto') return setting;
  if (platform !== 'linux') return 'default';
  const read = (name) => {
    try { return readFile(`/sys/class/dmi/id/${name}`, 'utf8').trim().toLowerCase(); }
    catch { return ''; }
  };
  const vendor = read('sys_vendor');
  const product = read('product_name');
  if (vendor === 'amazon ec2' || /^i-(?:[0-9a-f]{8}|[0-9a-f]{17})$/.test(read('board_asset_tag'))) return 'aws';
  if (product === 'google compute engine') return 'gcp';
  return 'default';
}
