# Text-to-Pod CLI Roadmap

## Completed Improvements

### ✅ Remove Token Monitoring
- **Completed**: Removed all token tracking from script generation and metadata stages
- **Changes**: 
  - Removed token console output from script and metadata stages
  - Removed token database writes while preserving schema columns
  - Fixed unused variable warnings
- **Impact**: Cleaner codebase, no functional impact

### ✅ Adjust Audio Tone and Energy
- **Completed**: Implemented scholarly tone using OpenAI TTS instructions parameter
- **Changes**: 
  - Added instructions parameter for measured, contemplative delivery
  - Maintained existing voice (ash) and natural pacing
  - Preserved original script content
- **Impact**: Audio now has appropriate scholarly tone instead of "shouting headlines"

## Future Enhancements

### 🎯 Content Quality Improvements (High Priority)
- **Goal**: Enhance podcast engagement through better content extraction and structure
- **Planned Changes**:
  - **Extract analogies from source**: Add requirement to find at least 3 specific analogies/metaphors from source content or comments instead of creating them
  - **Remove artificial hooks**: Eliminate LLM-generated hook language that sounds unnatural
  - **Enhanced people identification**: Strengthen requirements to identify specific people/groups affected (content creator, intended audience, comment demographics)
  - **Sentence variety**: Add refinement rules for varied sentence length and rhythm
  - **Detailed endings**: Replace forward-looking questions with concrete details and verbatim readings of interesting but less critical content
- **Impact**: More engaging, authentic content that leverages existing source material
- **Priority**: High - Directly improves listener experience

### Podcast Landing Page
- **Goal**: Create a web presence for the podcast
- **Options to consider**:
  - Generate static HTML from RSS feed data
  - Deploy to podcast platforms (Apple Podcasts, Spotify, etc.)
  - Create simple episode archive with search functionality
- **Priority**: Medium - Improves discoverability and user experience

### Additional Features
- Episode management and editing tools
- Batch processing for multiple URLs
- Custom voice configuration per episode type
- Audio post-processing and enhancement
- Analytics and usage tracking

---

## Implementation Status

### 🔄 In Progress
- **Content Quality Improvements**: Prompt updates planned to enhance engagement through better source content utilization

### 📋 Next Steps
1. Update SCRIPT_OUTLINE_SYSTEM to add analogy extraction and people identification requirements
2. Update SCRIPT_CONTENT_SYSTEM to remove hook language and add sentence variety instructions  
3. Update SCRIPT_REFINEMENT_SYSTEM to include sentence variety and detailed ending requirements
4. Update corresponding USER prompts to match system changes
5. Test with new episodes to validate improved engagement

*The core text-to-podcast pipeline is complete with improved audio quality and cleaner codebase. Ready for production use and targeted content quality enhancements.*