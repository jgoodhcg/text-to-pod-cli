import type { Context } from '../types.js';

export async function runScript(context: Context): Promise<void> {
  console.log('[script] Running script stage');
  console.log('[script] Model:', context.options.scriptModel);
  console.log('[script] Dry run:', context.options.dryRun);
  // TODO: Implement script stage logic
}