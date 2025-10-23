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

*The core text-to-podcast pipeline is now complete with improved audio quality and cleaner codebase. Ready for production use and future enhancements.*