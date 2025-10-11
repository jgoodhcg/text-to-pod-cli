import type { Context } from '../types.js';

export async function runMerge(context: Context): Promise<void> {
  console.log('[merge] Running merge stage');
  console.log('[merge] Dry run:', context.options.dryRun);
  // TODO: Implement merge stage logic
}