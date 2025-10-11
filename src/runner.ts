import { runMetadata } from './stages/metadata.js';
import { runScript } from './stages/script.js';
import { runAudio } from './stages/audio.js';
import { runMerge } from './stages/merge.js';
import { runPublish } from './stages/publish.js';
import type { Context } from './types.js';

const stages = [
  { name: 'metadata', fn: runMetadata },
  { name: 'script', fn: runScript },
  { name: 'audio', fn: runAudio },
  { name: 'merge', fn: runMerge },
  { name: 'publish', fn: runPublish },
];

export async function runPipeline(context: Context): Promise<void> {
  if (context.options.runStage) {
    // Run single stage
    const stage = stages.find(s => s.name === context.options.runStage);
    if (!stage) {
      throw new Error(`Unknown stage: ${context.options.runStage}`);
    }
    console.log(`Running single stage: ${stage.name}`);
    await stage.fn(context);
  } else {
    // Run from startStage to publish
    const startIndex = stages.findIndex(s => s.name === context.options.startStage);
    if (startIndex === -1) {
      throw new Error(`Unknown start stage: ${context.options.startStage}`);
    }
    
    console.log(`Running pipeline from stage: ${context.options.startStage}`);
    for (let i = startIndex; i < stages.length; i++) {
      const stage = stages[i];
      if (!stage) continue;
      console.log(`\n=== Running stage: ${stage.name} ===`);
      await stage.fn(context);
    }
  }
  
  console.log('\n=== Pipeline completed ===');
}