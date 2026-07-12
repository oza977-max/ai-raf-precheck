// V2-A. Rule 3: persistence-only. Vite bundles every pack file under
// policy/packs/ as raw YAML at build time — the file system IS the pack
// registry in V1 (no upload UI; packs are versioned in git alongside
// the policy, per the corpus-maintenance model in design-vision).
const files = import.meta.glob('../../policy/packs/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function getPackSources(): Record<string, string> {
  return files;
}
