import { runMetadata } from './stages/metadata.js';
import { runScript } from './stages/script.js';
import { runAudio } from './stages/audio.js';
import { runMerge } from './stages/merge.js';
import { runPublish } from './stages/publish.js';
import { runHtml } from './stages/html.js';
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
    if (context.options.runStage === 'html') {
      console.log('Running HTML generation stage');
      await runHtml(context);
      return;
    }
    
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

  // Run HTML generation after publish stage (unless explicitly running a single stage)
  if (!context.options.runStage && context.options.startStage !== 'html') {
    console.log('\n=== Running HTML Generation ===');
    try {
      await runHtml(context);
    } catch (error) {
      console.error('HTML generation failed:', error instanceof Error ? error.message : String(error));
      // Don't fail the pipeline if HTML generation fails
    }
  }

  console.log('=== Pipeline completed ===');
}
  
  console.log('\n=== Pipeline completed ===');
}