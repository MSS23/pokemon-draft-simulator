# Pokémon Showdown Format Sync

This document explains the hybrid format data system that combines manual format definitions with live data from Pokémon Showdown.

## Overview

The app uses a **hybrid approach** for format data:

1. **Manual Formats** (Default): Hardcoded format definitions in `src/lib/formats.ts` that work offline
2. **Showdown Sync** (Optional): Fetch up-to-date format rules from Pokémon Showdown's official data

## Benefits

### Manual Formats
- ✅ Always available (no external dependencies)
- ✅ Fast loading (no network requests)
- ✅ Predictable and stable
- ❌ Requires manual updates when VGC rules change

### Showdown Sync
- ✅ Always up-to-date with official VGC rules
- ✅ Comprehensive banned Pokémon lists
- ✅ Community-maintained (by Smogon/Showdown)
- ❌ Requires network access
- ❌ Depends on Showdown availability

## How It Works

### 1. Default Behavior
The app starts with manual format definitions. These formats are:
- VGC 2024 Regulation H
- VGC Doubles
- Gen 9 OU
- And more...

### 2. Optional Sync
Admins can sync with Pokémon Showdown to:
- Update banned Pokémon lists
- Get the latest format restrictions
- Ensure compliance with current VGC regulations

### 3. Data Merging
When synced, Showdown data is **merged** with manual formats:
- Manual format structure is preserved
- Banned Pokémon lists are updated from Showdown
- Original format metadata is kept
- Showdown data takes precedence for banlists

### 4. Caching
Synced data is cached locally (localStorage) for:
- 7 days validity period
- Offline access after initial sync
- Reduced network requests

## Usage

### Admin Panel

Access the admin panel at `/admin` to:

1. **Check Sync Status**: See when data was last synced
2. **Sync Now**: Fetch latest data from Pokémon Showdown
3. **Clear Cache**: Revert to manual formats

### Programmatic Usage

```typescript
import { syncShowdownData, getCachedShowdownData } from '@/services/showdown-sync'

// Sync with Showdown
const result = await syncShowdownData()
if (result.success) {
  console.log(`Synced ${result.formatsUpdated} formats`)
}

// Get cached data
const cached = getCachedShowdownData()
if (cached) {
  console.log('Using cached Showdown data from', cached.lastUpdated)
}
```

### API Endpoint

```bash
# Trigger sync
POST /api/formats/sync

# Check sync status
GET /api/formats/sync
```

## Data Sources

### Official Sources
- **Pokémon Showdown**: https://play.pokemonshowdown.com/data/
  - `formats.js` - Format definitions and rules
  - `formats-data.js` - Detailed format data
- **GitHub**: https://github.com/smogon/pokemon-showdown
  - Source code and data files

### Official VGC Announcements
- Pokémon SV News: https://sv-news.pokemon.co.jp
- Pokémon Blog: https://www.pokemonblog.com
- Victory Road: https://victoryroad.pro

## Format Mapping

Showdown formats are mapped to our format IDs:

| Showdown ID | Our Format ID | Name |
|------------|---------------|------|
| `gen9vgc2024regh` | `vgc-reg-h` | VGC 2024 Regulation H |
| `gen9vgc2024regg` | `vgc-reg-g` | VGC 2024 Regulation G |
| `gen9battlestadiumsingles` | `gen9-ou` | Gen 9 OU |

## Cache Management

### Automatic
- Cache expires after 7 days
- Stale cache warning shown in admin panel

### Manual
- Clear cache via admin panel
- Reverts to manual formats immediately

## Technical Details

### Files
- `src/services/showdown-sync.ts` - Sync service
- `src/app/api/formats/sync/route.ts` - API endpoint
- `src/components/admin/FormatSyncPanel.tsx` - Admin UI
- `src/lib/formats.ts` - Format definitions and merge logic

### Data Flow
1. User clicks "Sync Now" in admin panel
2. Frontend calls `/api/formats/sync`
3. API fetches data from Pokémon Showdown
4. Data is parsed and cached in localStorage
5. Page reloads to apply new formats
6. Format rules engine uses merged data

### Storage
```javascript
// localStorage keys
localStorage.getItem('showdown-formats')  // Cached format data
localStorage.getItem('showdown-last-sync') // Last sync timestamp
```

## Troubleshooting

### Sync Fails
- Check internet connection
- Verify Pokémon Showdown is accessible
- Check browser console for errors
- Try clearing cache and re-syncing

### Formats Not Updating
- Ensure sync completed successfully
- Check that page reloaded after sync
- Verify cache is not stale
- Clear browser cache if needed

### Offline Usage
- Synced data works offline for 7 days
- Manual formats always work offline
- Clear cache to use manual formats only

## Future Improvements

Potential enhancements:
- [ ] Server-side caching (database)
- [ ] Automatic background sync
- [ ] Format comparison tool
- [ ] Sync history/changelog
- [ ] Custom format editor
- [ ] Import/export format definitions

## References

- [Pokémon Showdown Data](https://play.pokemonshowdown.com/data/)
- [Showdown GitHub](https://github.com/smogon/pokemon-showdown)
- [VGC Rules (Victory Road)](https://victoryroad.pro)
- [Official VGC Regulations](https://sv-news.pokemon.co.jp)
