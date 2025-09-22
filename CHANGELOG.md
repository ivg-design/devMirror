# DevMirror Changelog

All notable changes to the DevMirror VS Code extension will be documented in this file.

## [0.4.51] - 2025-09-22

### Fixed
- Fixed aggressive auto-reconnect loop in CEF mode that was creating multiple simultaneous connection attempts
- Added proper reconnect throttling with max attempts (10) and delay between attempts (5 seconds)
- Improved connection state management to prevent reconnect cascades
- Fixed WebSocket cleanup to properly remove event listeners

### Added
- New `autoOpenBrowser` configuration option for CEF mode
- Automatically opens browser to CEF debug interface when enabled
- Requires 'open' package for cross-platform browser launching

### Changed
- Reconnect logic now uses class-level state tracking instead of local variables
- WebSocket close/error handlers now check if socket is still active before reconnecting
- Improved reconnect attempt logging with attempt counter

## [0.4.50] - 2025-09-22

### Fixed
- Fixed "Cannot read properties of undefined (includes)" error when scriptCommand is undefined
- Wizard panel now properly hides/shows using VS Code context API
- Cancel and Generate buttons now properly close the wizard panel

### Changed
- Removed script info box from wizard (was showing empty command)
- Wizard visibility controlled via `devmirror.showWizard` context
- Panel automatically hides after configuration or cancellation

### Improved
- Better handling of wizard lifecycle with proper show/hide functionality
- Can now reopen wizard after cancelling without manual intervention

## [0.4.49] - 2025-09-22

### Fixed
- WebviewView implementation aligned with VS Code API constraints
- Cancel and success states now show clear visual feedback in the wizard
- Added disposal handler to prevent "Webview is disposed" errors
- Added instructions for manually closing the wizard panel (VS Code limitation)
- Fixed timing issue when loading script data into newly created webviews

### Changed
- Wizard now shows clear instructions that panel must be manually closed via context menu
- Success and cancel states have distinct visual presentations

## [0.4.48] - 2025-09-22

### Fixed
- Setup wizard now properly detects and configures interactive CLI applications
- Generates background runner script for interactive CLIs to prevent interference
- Improved script generation logic for different workflow types

## [0.4.47] - 2025-09-22

### Fixed
- Wizard panel now properly clears after configuration or cancellation
- Improved wizard panel behavior to show placeholder message when not in use
- Added better user feedback when configuration is saved

## [0.4.46] - 2025-09-21

### Added
- Setup Wizard with webview UI for advanced configuration
  - Compact form with dropdowns, inputs, and checkboxes
  - Script analysis and intelligent suggestions
  - Detects CEF, interactive CLIs, and other patterns
- Undo functionality for script modifications
  - Automatic backup before any changes
  - Right-click undo option on modified scripts
  - Visual indicators for modified scripts
- Two-button system in tree view:
  - Plus (+) for simple quick setup
  - Gear (⚙️) for advanced wizard configuration

### Improved
- Wizard closes automatically on Generate or Cancel
- Ultra-compact UI design for better space utilization
- Transparent background to blend with VS Code theme

### Fixed
- Webview initialization and visibility issues
- Wizard now appears in Explorer panel as intended

## [0.4.43] - 2025-09-21

### Fixed
- Closing bracket now indented with 2 spaces for clean VS Code folding
- Prevents extra line in folded view

## [0.4.42] - 2025-09-21

### Fixed
- Closing brackets no longer get extra indentation
- JSON objects now format correctly with closing bracket at column 0

## [0.4.41] - 2025-09-21

### Fixed
- Actually fixed JSON closing bracket indentation (was returning wrong variable)
- Closing brackets now properly indented with 2 spaces

## [0.4.40] - 2025-09-21

### Fixed
- JSON objects and arrays now have properly indented closing brackets
- All lines after first are indented by 2 spaces for clean folding

## [0.4.39] - 2025-09-21

### Improved
- Simplified log format - removed redundant CONSOLE: prefix
- Compact timestamp format: yymmddThh:mm:ss.ms (2-digit milliseconds)
- JSON objects now properly indented for clean code folding
- Much cleaner and more readable logs

## [0.4.38] - 2025-09-21

### Fixed
- CRITICAL FIX: Only create ONE WebSocket connection
- Passive port monitoring - check CEF availability without creating connections
- Clean up any existing WebSocket before creating new one
- Prevents duplicate messages from multiple active connections

## [0.4.37] - 2025-09-21

### Fixed
- Smart context detection based on connection attempts
- If DevMirror connects quickly (1-2 attempts) = CEF was already running = ignore initial context
- If DevMirror needs multiple retries (3+) = CEF just started = capture initial context
- Removed tentative buffer complexity

## [0.4.36] - 2025-09-21

### Fixed
- Better detection of pre-existing contexts
- Track all initial contexts seen before executionContextsCleared
- Only start capturing after contexts are cleared and new ones created
- Ignore messages from any initial context IDs

## [0.4.35] - 2025-09-21

### Fixed
- MAJOR FIX: Ignore pre-existing contexts on DevMirror startup
- Only capture logs from contexts created AFTER DevMirror connects
- Prevents capturing stale logs from previous sessions
- Shows "FRESH CONTEXT DETECTED" message when starting capture
- Removed debug messages from log output

## [0.4.34] - 2025-09-21

### Added
- Debug messages written directly to log file with [DEBUG] prefix
- Shows execution context IDs for every console message
- Shows when messages are ignored due to context mismatch

## [0.4.33] - 2025-09-21

### Added
- Debug logging to track execution context IDs
- Connection counter to detect multiple CDP connections
- Local time format in reload/refresh markers

### Fixed
- Use local time format in reload markers to match log timestamps

## [0.4.31] - 2025-09-21

### Fixed
- Stricter context filtering - only capture messages with valid executionContextId
- Fixed issue where messages without context ID were being captured
- First message now sets the context rather than capturing everything

## [0.4.30] - 2025-09-21

### Revolutionary Context-Aware Logging
- **EXECUTION CONTEXT FILTERING**: Eliminates ALL duplicate messages by tracking execution contexts
- **RELOAD/REFRESH MARKERS**: Clear visual delimiters when extension reloads or refreshes
- **NO MORE DUPLICATES**: Only logs from the current active execution context
- **ENHANCED LIFECYCLE TRACKING**: Shows context IDs, reload count, and session time

### Added
- Execution context tracking with `currentContextId`
- Reload detection via `Runtime.executionContextCreated` events
- Context destruction monitoring
- Page lifecycle events (load, navigation)
- Prominent reload markers in log output showing:
  - Reload count
  - Previous and new context IDs
  - Session elapsed time
  - Precise timestamps

### Fixed
- Complete elimination of duplicate log entries
- No more partial/incomplete initial messages
- Proper filtering of stale execution contexts

### Technical Changes
- Filters `Runtime.consoleAPICalled` by `executionContextId`
- Tracks context lifecycle with `executionContextCreated/Destroyed/Cleared`
- Page domain enabled for lifecycle events only (not console)

## [0.4.29] - 2025-09-21

### Fixed
- **Empty outputDir Error**: Fixed "ENOENT: no such file or directory" error
- LogWriter no longer initialized with empty string in constructor
- Default outputDir to './devmirror-logs' if not specified in config

## [0.4.28] - 2025-09-21

### Fixed
- **SINGLE LOG FILE PER SESSION**: Fixed issue where DevMirror created multiple log files
- **NO MORE DUPLICATES**: Only enable Runtime domain like CEF logger - no more 10x duplicate messages
- **STABLE CONNECTION**: Improved reconnection logic with exponential backoff
- LogWriter initialized ONCE at startup, not on each reconnection

### Changed
- Only Runtime.consoleAPICalled and Runtime.exceptionThrown events captured
- Removed Console, Log, Network, Page domains that caused duplicates
- Matches CEF logger's approach exactly for consistent results

### Improved
- One log file per session, not per connection attempt
- No duplicate messages from multiple CDP domains
- More stable WebSocket connection with better retry logic

## [0.4.27] - 2025-09-20

### Revolutionary Fix
- **BROWSERLESS CONSOLE CAPTURE**: DevMirror now connects directly to CEF without opening a browser!
- Applied CEF logger's approach - direct WebSocket connection to CDP
- Console capture starts immediately when CEF target is available
- Browser is now OPTIONAL - only needed if you want to view the console visually
- Captures 100% of logs from the beginning, just like CEF logger

### Removed
- Removed browser dependency for console capture
- No more Puppeteer browser launch for CEF mode
- No more navigation to debug interface required

### Improved
- Much faster connection - no browser startup overhead
- More reliable capture - no browser-related issues
- Cleaner architecture - follows CEF logger's proven approach

## [0.4.24] - 2025-09-20

### Testing
- **Disabled Auto-Navigation**: Testing if auto-navigation causes WebSocket errors
- Browser now stops at localhost:8555 index page
- Manual navigation required to reach DevTools
- This will help identify if auto-navigation interferes with connection

## [0.4.23] - 2025-09-20

### Fixed
- **WebSocket Error Issue**: Extension was loading before Vite was ready
- Start DevMirror and Vite SIMULTANEOUSLY to prevent reload
- Both must be ready when extension loads to avoid connection errors

### Analysis
- CEF extension loads from cache when Vite isn't ready
- This causes WebSocket errors and triggers a reload
- Starting both services together prevents this issue

## [0.4.22] - 2025-09-20

### Fixed
- **CRITICAL FIX**: DevMirror must start FIRST, not second!
- Proof: Log 161708 captured everything because DevMirror was already running
- Now starts DevMirror first, waits 5 seconds, then starts Vite
- This ensures DevMirror is connected BEFORE extension loads

### Corrected
- Previous "CDP limitation" was wrong - it CAN capture from beginning
- The issue was timing, not protocol limitations
- When DevMirror is ready first, it captures 100% of logs

## [0.4.21] - 2025-09-20

### Fixed
- **Removed Console.enable hack**: Console buffer is limited, only gives partial messages
- Simplified to use only Runtime.enable for clean capture
- Fixed startup sequence - Vite starts first, then DevMirror

### Improved
- Cleaner logs without partial buffer dumps
- Better timing for faster initial connection

## [0.4.20] - 2025-09-20

### Added
- **Capture Buffered Console Messages**: Now retrieves ALL console messages from before connection!
- Enable Console domain briefly to get buffered messages, then disable to avoid duplicates
- Console.enable "sends the messages collected so far" - this gets the missing 90% of startup logs

### Fixed
- Missing startup logs issue - now captures messages from before DevMirror connected
- Proper sequencing: Console.enable → get buffered → Console.disable → Runtime.enable

## [0.4.19] - 2025-09-20

### Fixed
- **ROOT CAUSE of Duplicates Found**: Multiple CDP domains were sending the same console events
- Disabled Console.enable and Log.enable domains - only Runtime.enable needed
- Runtime.consoleAPICalled provides the most complete info including stackTrace
- No more duplicate log entries!

### Improved
- Cleaner console capture with single event source
- Better performance with fewer CDP domains enabled

## [0.4.18] - 2025-09-20

### Fixed
- **Duplicate Log Entries**: Removed duplicate event handlers that were causing double logging
- **Missing Source Information**: Now captures file name and line numbers from stackTrace
- Disabled old CDP handlers when using universal capture to prevent duplicates

### Improved
- Source location now shown as [filename:line] when available
- Cleaner log output without duplication

## [0.4.17] - 2025-09-20

### Reverted
- **Reverted Async Object Serialization**: Rolled back to synchronous capture to fix broken logging
- Console capture now working again with basic object preview
- Objects show preview properties when available (synchronously)

### Fixed
- Console logging works again after reverting async changes
- WebSocket message handler no longer breaks on console events

## [0.4.16] - 2025-09-20

### Fixed
- **Infinite Navigation Loop**: Fixed CEF auto-navigation getting stuck in infinite loop
- Added navigation guard flag to prevent concurrent navigation attempts
- Added return statements after successful navigation to exit early
- Better URL detection to avoid re-navigating when already on DevTools

### Improved
- Cleaner navigation flow in CEF mode
- Prevention of duplicate navigation attempts

## [0.4.15] - 2025-09-20

### Critical Fix
- **Fixed Missing Dependencies**: Package now includes puppeteer-core and ws dependencies
- Extension package size restored to ~10MB (was incorrectly 242KB)
- Puppeteer-core now properly bundled with extension

## [0.4.14] - 2025-09-20

### Fixed
- **Async Object Serialization**: Fixed async/await handling in captureConsoleEvent
- Objects are now properly serialized using Runtime.getProperties
- WebSocket message handler properly handles async console capture
- Removed terminal CDP event debug logging for cleaner output

### Improved
- Better object representation in logs showing actual property values
- Silent error handling for async capture operations
- Cleaner console output without CDP event spam

## [0.4.13] - 2025-09-20

### Changed
- **Universal Console Capture**: Complete rewrite to capture ALL console events
- No longer relies on specific event handlers - captures everything
- Works with custom loggers and any console method
- Handles all CDP console-related events: Runtime.consoleAPICalled, Console.messageAdded, Log.entryAdded, Runtime.exceptionThrown
- Generic fallback for unknown console event types

### Added
- Universal `captureConsoleEvent()` method that handles all console events
- Immediate LogWriter initialization in WebSocket connection
- Support for ANY console method, including custom implementations

### Improved
- Simplified architecture - no need to register specific handlers
- More reliable capture - events are caught directly in WebSocket message handler
- Better support for custom logging libraries and non-standard console methods

## [0.4.12] - 2025-09-20

### Enhanced
- **Improved Object Capture with Runtime.getProperties**: Better async handling
- More robust fallback to preview when CDP fetch fails
- Cleaner JSON representation of complex objects
- Better error handling for CDP property fetching

## [0.4.11] - 2025-09-20

### Fixed
- **Object Serialization in Console**: Properly captures object contents instead of `[Object object]`
- Uses `Runtime.getProperties` to fetch full object structure
- Handles arrays, objects, and nested properties correctly
- Shows all object properties with their values in readable format

### Added
- Deep object inspection for logged objects
- Array contents displayed as `[item1, item2, ...]`
- Object contents displayed as `ClassName {prop1: value1, prop2: value2, ...}`
- Overflow indicator when objects have more properties than shown in preview

### Improved
- Debug logging shows first 200 characters of captured messages
- Better handling of functions, undefined, null values
- Async processing for fetching object properties via CDP

## [0.4.10] - 2025-09-20

### Added
- **Auto-Navigation to CEF Debug Interface**: Bypasses "Inspectable WebContents" index page
- Automatically navigates to DevTools frontend URL
- Handles reconnection scenarios with auto-navigation
- Monitors for error pages and re-navigates automatically

### Improved
- CEF debug experience - no manual clicking required
- Automatic recovery from "This site can't be reached" errors
- Seamless reconnection when Adobe app restarts
- Continuous monitoring for index/error pages with auto-correction

## [0.4.9] - 2025-09-20

### Fixed
- **CEF Limited Protocol Support**: Direct WebSocket connection bypasses Puppeteer browser abstractions
- Avoids `Target.getBrowserContexts` and other unsupported CEF CDP commands
- Uses raw WebSocket (ws library) for direct CDP communication

### Added
- Custom minimal CDP client specifically for CEF compatibility
- Direct WebSocket message handling for events and commands
- Proper event registration without browser-level requirements

### Improved
- CEF connection no longer attempts unsupported browser operations
- More reliable connection to CEF debug targets
- Better error handling for CEF-specific limitations

## [0.4.8] - 2025-09-20

### Fixed
- **CEF Console Capture via CDP WebSocket**: Properly connects to Chrome DevTools Protocol for CEF
- Uses all CDP event types: `Runtime.consoleAPICalled`, `Log.entryAdded`, `Console.messageAdded`, `Runtime.exceptionThrown`
- Captures console.log, console.error, JavaScript errors, and all log entries

### Added
- **Robust Auto-Reconnect**: Monitors multiple disconnection events
- Handles WebSocket disconnection, CDP session detachment, and target crashes
- Automatically reconnects every 3 seconds when connection is lost
- Maintains console capture through Adobe app/extension restarts

### Improved
- Better debug output showing all available targets and connection status
- Shows captured log entries in terminal for verification
- Multiple CDP domains enabled for comprehensive capture

## [0.4.7] - 2025-09-20

### Fixed
- **CEF Mode Browser Launch**: CEF mode now properly opens Chrome browser to debug interface
- Unified CDPManager to handle both CDP and CEF modes (removed separate CEFBridge)
- Auto-detect CEF mode when cefPort is present in config

### Improved
- Explorer panel now properly detects CEF projects and updates config accordingly
- Detects .debug files and CEP/CEF indicators in package.json
- Automatically sets mode to 'cef' when cefPort is configured
- Config validation ensures proper mode/port combinations

## [0.4.6] - 2025-09-20

### Fixed
- **CEF Mode Completely Rewritten**: Now properly opens Chrome to debug interface
- CEF mode navigates to `http://localhost:cefPort` instead of trying CDP connection
- No longer confuses CEF debug port with dev server ports

### Added
- **Auto-Reconnect for CEF**: Monitors CEF availability and auto-refreshes
- Detects when Adobe app/extension restarts and reconnects automatically
- Shows clear status messages for CEF connection state
- Stops monitoring once connected to DevTools

### Improved
- CEF configuration now includes helpful comments and placeholders
- Better error messages when CEF debugger isn't available
- Separate Chrome profile for CEF debugging

## [0.4.5] - 2025-09-20

### Added
- **Auto Port Detection**: Automatically detects running dev servers
- Scans common ports (3000, 5173, 8080, etc.)
- Checks package.json scripts for port configurations
- New `autoDetectPort` config option
- URL is now optional in config - can be auto-detected

### Fixed
- Fixed "Requesting main frame too early" error
- Added page initialization wait and recovery mechanism
- Handles page recreation when frame isn't ready
- Better support for CEP/Vite projects with dynamic ports

### Improved
- More robust page initialization with document check
- Recovers from frame errors during retry loop
- Flexible port configuration for CEF debugging

## [0.4.4] - 2025-09-20

### Added
- Retry logic with exponential backoff for dev server connection
- Waits up to 10 attempts for server to start before failing
- Shows progress messages while waiting for server

### Fixed
- DevMirror now handles slow-starting dev servers gracefully
- No longer fails immediately if server isn't ready

## [0.4.3] - 2025-09-20

### Fixed
- Chrome no longer opens with a blank tab - uses existing tab instead
- Settings now properly exposed in VS Code settings UI

## [0.4.2] - 2025-09-20

### Fixed
- Auto-refresh now triggers correctly when log count changes
- Uses the same mechanism as status bar updates for consistent behavior
- Settings for autoRefresh and autoFold properly configured

## [0.4.1] - 2025-09-20

### Fixed
- Package size reporting issue
- Verified HTTP IPC implementation working correctly

## [0.4.0] - 2025-09-20

### Changed
- **MAJOR ARCHITECTURE CHANGE**: Replaced file-based status system with proper HTTP IPC
- Extension runs local HTTP server on port 37240 for CLI communication
- CLI sends activation data via HTTP POST request to extension
- Status bar activation triggered by HTTP message with path/PID data
- Simplified statusMonitor to use PID-based process monitoring (reduced from 249 to 173 lines)
- Removed recursive directory scanning for status files
- Improved performance by eliminating constant file I/O operations

### Fixed
- Status files no longer persist after process crashes
- Eliminated cleanup issues with `.devmirror-status.json` files
- Fixed auto-refresh and auto-fold functionality with proper file watching
- Resolved settings visibility issues in VS Code
- No more stale status indicators

### Improved
- Cleaner process lifecycle management
- Instant status bar activation/deactivation
- More reliable process state detection via PID monitoring
- Direct communication between CLI and VS Code extension
- Reduced system overhead (no more 1-second status file writes)

## [0.3.8] - 2025-09-20

### Added
- Configuration settings for auto-refresh and auto-fold
- DevMirror: Open Settings command
- Settings open when clicking status bar with no active monitoring

### Fixed
- Auto-refresh now properly detects active editor
- Faster status bar response (1 second check interval, 3 second timeout)
- Better workspace detection for multi-project setups

## [0.3.7] - 2025-09-20

### Fixed
- Status bar now always visible (was being hidden incorrectly)
- Added auto-refresh for open log files when new content arrives
- Auto-refresh debounced to 1.5 seconds to prevent spamming
- Maintains scroll position or follows tail if at bottom
- Applies folding after each refresh

## [0.3.6] - 2025-09-20

### Fixed
- Folding now applies to new log entries with better preservation of cursor position
- Status bar shows green emoji when running, hidden when inactive
- Status bar displays log count and uptime correctly
- Status bar click opens the correct workspace log file
- Log viewer opens at bottom (tail) with auto-scroll ready
- Improved folding debounce to 1 second for better stability

## [0.3.5] - 2025-09-20

### Fixed
- DevMirror Scripts panel now uses dynamic npx devmirror-cli wrapper
- Status bar monitoring now properly shows log count and session timer
- Log viewer opens in active tab instead of beside panel
- Word wrap automatically disabled when viewing logs
- Improved log folding with better detection on file open
- Status monitor more reliably detects running CLI instances

## [0.3.4] - 2025-01-20

### Fixed
- Status bar now shows immediately when extension activates
- Fixed log folding by watching all .log files in devmirror-logs
- Added multiple file watchers for better folding detection
- Folding now applies to any open log file in devmirror-logs directory

## [0.3.3] - 2025-01-20

### Added
- Dynamic CLI wrapper that automatically finds the latest DevMirror extension version
- Scripts now use `npx devmirror-cli` instead of hard-coded paths
- No more manual updates needed when extension is upgraded

### Fixed
- Extension will now work correctly after updates without modifying package.json

## [0.3.2] - 2025-01-20

### Fixed
- Fixed puppeteer-core loading to check project directory first before failing
- CEFBridge now uses dynamic puppeteer loading like CDPManager

## [0.3.1] - 2025-01-20

### Fixed
- Timestamp format now uses local time correctly without microseconds
- Fixed Chrome DevTools timestamp multiplication bug causing invalid dates
- README accuracy: clarified use of Puppeteer/Chromium instead of Chrome

## [0.3.0] - 2025-01-20

### Added
- Production-ready stable release
- Optimized package size (reduced to 2.72 MB)
- Proper .vscodeignore file for clean packaging
- Clean codebase with removed unnecessary folders

### Changed
- Optimized extension icon (reduced from 332 KB to 66 KB)
- Improved build process

## [0.2.9] - 2025-01-20

### Added
- Status Bar Auto-Detection for running CLI instances
- Debounced log folding (waits 500ms after last write)
- Local time timestamps (format: YYYY-MM-DD HH:MM:SS.m)
- CLI status file for VS Code detection

### Fixed
- Status bar now appears when running :mirror scripts
- Log folding no longer spams during heavy logging

## [0.2.8] - 2025-01-20

### Fixed
- Chrome viewport now uses full window size (defaultViewport: null)
- Improved log folding with foldAll command
- Better editor timing for fold operations

## [0.2.7] - 2025-01-20

### Added
- Auto config creation for nested packages in monorepos
- Smart port detection from scripts, .env files, or framework defaults
- Config validation and auto-update for missing fields

### Changed
- Supports Vite (5173) and Next.js (3000) default ports

## [0.2.6] - 2025-01-20

### Added
- Monorepo support with tree view in Explorer
- Script Manager for one-click :mirror script addition
- Fixed log folding to properly collapse entries
- Chrome launches maximized to prevent viewport constraints

## [0.2.5] - 2025-01-20

### Added
- Flexible puppeteer-core loading (supports global and project-local)
- Better error messages when puppeteer-core is missing

## [0.2.4] - 2025-01-20

### Fixed
- Extension ID detection for all publisher ID variations

## [0.2.3] - 2025-01-20

### Added
- Persistent Chrome profile for DevTools settings
- Official IVGDesign publisher ID
- Repository links to GitHub

## [0.2.2] - 2025-01-20

### Added
- Live status bar showing log count and capture duration
- Auto-folding logs when viewing
- Beautiful DevMirror icon
- Direct VS Code commands (no terminal needed)

### Changed
- No longer creates .devmirror folder
- Runs directly from extension directory

## [0.2.0] - 2025-01-20

### Added
- Initial beta release
- Chrome DevTools Protocol integration
- Console output capture
- Network error tracking
- Security monitoring
- Page lifecycle events
- Adobe CEP support
- Timestamped logs
- Automatic file rotation at 50MB
- Message deduplication