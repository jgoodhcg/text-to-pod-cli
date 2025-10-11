import type { Context } from '../types.js';

export async function runPublish(context: Context): Promise<void> {
  console.log('[publish] Running publish stage');
  console.log('[publish] No publish:', context.options.noPublish);
  console.log('[publish] Dry run:', context.options.dryRun);
  // TODO: Implement publish stage logic
}