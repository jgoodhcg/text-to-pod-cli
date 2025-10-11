import type { Context } from '../types.js';

export async function runMetadata(context: Context): Promise<void> {
  console.log('[metadata] Running metadata stage');
  console.log('[metadata] URL:', context.options.url);
  console.log('[metadata] Dry run:', context.options.dryRun);
  // TODO: Implement metadata stage logic
}