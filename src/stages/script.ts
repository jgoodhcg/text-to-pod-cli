import type { Context, ScriptDialogue } from '../types.js';
import OpenAI from 'openai';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { CONFIG } from '../config.js';
import { extractJsonArray, sanitizeJsonText } from '../utils.js';

export async function runScript(context: Context): Promise<void> {
  console.log('[script] Running script stage');
  console.log('[script] Model:', context.options.scriptModel);
  console.log('[script] Dry run:', context.options.dryRun);

  if (!context.episodeId || !context.paths.scriptFile) {
    throw new Error('Episode ID and script file path must be set in context');
  }

  // Check if already completed
  const existing = context.db.findByEpisodeId(context.episodeId);
  if (existing?.script_status === CONFIG.STAGE_STATUS.COMPLETED) {
    console.log('[script] Stage already completed, skipping');
    return;
  }

  // Check prerequisites
  if (!existing || existing.metadata_status !== CONFIG.STAGE_STATUS.COMPLETED) {
    throw new Error('Metadata stage must be completed before script generation');
  }

  // Update status to in-progress
  if (!context.options.dryRun) {
    context.db.updateStageStatus(context.episodeId, 'script', CONFIG.STAGE_STATUS.IN_PROGRESS);
  }

  if (context.options.dryRun) {
    console.log('[script] Dry run: would call OpenAI API to generate script');
    console.log('[script] Dry run: would save script to', context.paths.scriptFile);
    return;
  }

  // Ensure directory exists
  const scriptDir = dirname(context.paths.scriptFile);
  if (!existsSync(scriptDir)) {
    mkdirSync(scriptDir, { recursive: true });
  }

  // Call OpenAI API
  const openai = new OpenAI();
  
  const systemPrompt = context.options.scriptSystemPrompt || CONFIG.PROMPTS.SCRIPT_SYSTEM;
  const userPrompt = context.options.scriptPromptTemplate 
    ? context.options.scriptPromptTemplate
        .replace('{title}', existing.metadata_title || '')
        .replace('{summary}', existing.metadata_summary || '')
    : CONFIG.PROMPTS.SCRIPT_USER(
        existing.metadata_title || '',
        existing.metadata_summary || ''
      );

  try {
    // Use Responses API for web search
    const response = await (openai as any).responses.create({
      model: context.options.scriptModel,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      tools: [
        {
          type: "web_search"
        }
      ],
      tool_choice: "auto"
    });

    console.log('[script] Web search performed by model');
    if (response.usage) {
      console.log(`[script] Token usage: ${response.usage.prompt_tokens} prompt, ${response.usage.completion_tokens} completion`);
    }

    const finalContent = response.output_text;
    if (!finalContent) {
      throw new Error('No response from OpenAI');
    }

    console.log('[script] Raw response length:', finalContent.length);
    console.log('[script] Response preview:', finalContent.substring(0, 200) + '...');

    const jsonContentRaw = extractJsonArray(finalContent);
    if (!jsonContentRaw) {
      throw new Error('Failed to locate JSON array in script response');
    }

    console.log('[script] Extracted JSON array length:', jsonContentRaw.length);

    const jsonContent = sanitizeJsonText(jsonContentRaw);
    console.log('[script] JSON preview:', jsonContent.substring(0, 200) + '...');

    let script: ScriptDialogue[];
    try {
      script = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('[script] JSON parse error:', parseError);
      console.error('[script] Problematic JSON:', jsonContent);
      throw new Error(`Failed to parse script JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    
    // Validate script format
    if (!Array.isArray(script) || script.length === 0) {
      throw new Error('Script must be a non-empty array');
    }

    for (const entry of script) {
      if (!entry.persona || !entry.text) {
        throw new Error('Each script entry must have persona and text');
      }
      if (entry.persona !== CONFIG.PERSONAS.OPERATOR && entry.persona !== CONFIG.PERSONAS.HISTORIAN && entry.persona !== CONFIG.PERSONAS.NARRATOR) {
        throw new Error(`Invalid persona: ${entry.persona}. Must be OPERATOR, HISTORIAN, or NARRATOR`);
      }
    }

    // Check for persona alternation issues
    let consecutiveCount = 0;
    let lastPersona = '';
    for (const entry of script) {
      if (entry.persona === lastPersona) {
        consecutiveCount++;
        if (consecutiveCount >= 2) {
          console.warn('[script] Warning: Multiple consecutive lines from same persona');
        }
      } else {
        consecutiveCount = 0;
        lastPersona = entry.persona;
      }
    }

    // Save script to file
    writeFileSync(context.paths.scriptFile, JSON.stringify(script, null, 2));

    // Update database with results
    const updates: any = {
      script_model: context.options.scriptModel,
      script_file_path: context.paths.scriptFile,
      script_segment_count: script.length
    };

    if (response.usage?.prompt_tokens !== undefined) {
      updates.script_input_tokens = response.usage.prompt_tokens;
    }
    if (response.usage?.completion_tokens !== undefined) {
      updates.script_output_tokens = response.usage.completion_tokens;
    }

    context.db.updateStageStatus(context.episodeId, 'script', CONFIG.STAGE_STATUS.COMPLETED, updates);

    console.log('[script] Successfully generated and saved script');
    console.log(`[script] Script segments: ${script.length}`);
    const estimatedMinutes = script.reduce((sum, entry) => sum + entry.text.split(' ').length, 0) / CONFIG.WORDS_PER_MINUTE;
    console.log(`[script] Estimated audio time: ${estimatedMinutes.toFixed(1)} minutes`);

  } catch (error) {
    // Mark as failed
    context.db.updateStageStatus(context.episodeId, 'script', CONFIG.STAGE_STATUS.FAILED);
    throw error;
  }
}
