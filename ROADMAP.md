# Text-to-Pod CLI Roadmap

## Immediate Improvements

### Remove Token Monitoring
- **Issue**: Token monitoring in script generation shows 0 and doesn't add value
- **Action**: Remove all token tracking from script generation
- **Files to update**:
  - `src/stages/script.ts` - Remove token parameters from function signatures and return values
  - `src/database.ts` - Remove token columns from schema (keep metadata tokens for now)
  - `src/stages/audio.ts` - Remove token display from CLI output
- **Priority**: Medium - Code cleanup, no functional impact

### Fix Script Generation Token Display
- **Issue**: CLI shows 0 for token usage during script generation
- **Root cause**: Token extraction from OpenAI API response may be broken
- **Decision**: Remove token monitoring entirely rather than fix (see above)

### Adjust Audio Tone and Energy
- **Issue**: Current audio reads like someone shouting headlines, too high energy
- **Goal**: Lower energy, more measured and contemplative delivery
- **Potential solutions**:
  - Add SSML markup to control speech rate, pitch, and volume
  - Experiment with OpenAI TTS parameters for more natural pacing
  - Add post-processing to reduce overall volume and normalize levels
  - Test different voices that naturally have lower energy delivery
- **Files to investigate**:
  - `src/stages/audio.ts` - TTS API calls and parameters
  - Audio processing pipeline in merge stage
- **Priority**: High - Critical for user experience and matching scholarly tone

---

*This roadmap focuses on essential code cleanup and audio quality improvements. The multi-stage script generation system with enhanced descriptions is now complete and functional.*