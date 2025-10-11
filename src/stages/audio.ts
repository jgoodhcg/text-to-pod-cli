import type { Context } from '../types.js';

export async function runAudio(context: Context): Promise<void> {
  console.log('[audio] Running audio stage');
  console.log('[audio] Operator voice:', context.options.operatorVoice);
  console.log('[audio] Historian voice:', context.options.historianVoice);
  console.log('[audio] Dry run:', context.options.dryRun);
  // TODO: Implement audio stage logic
}