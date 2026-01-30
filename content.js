// Content script for rich text editors (Gmail, Outlook, Google Docs)
// UPDATED TO WORK WITH GOOGLE DOCS AND OUTLOOK

let selectedText = '';
let selectionRange = null;
let lastActiveElement = null;
let lastSelectionData = null;
let lastKnownSelection = ''; // Store the last known selection for Google Docs
let menuActionTriggered = false; // Flag to prevent auto-triggering
let lastPageContent = ''; // Cache page content

// Get selected text and save selection info
function getSelectedText() {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text) {
        try {
            if (selection.rangeCount > 0) {
                selectionRange = selection.getRangeAt(0).cloneRange();
            }

            // Save active element info
            lastActiveElement = document.activeElement;

            // For input/textarea elements, save position
            if (lastActiveElement && (lastActiveElement.tagName === 'TEXTAREA' || lastActiveElement.tagName === 'INPUT')) {
                lastSelectionData = {
                    element: lastActiveElement,
                    start: lastActiveElement.selectionStart,
                    end: lastActiveElement.selectionEnd,
                    value: lastActiveElement.value
                };
            }
        } catch (e) {
            console.log('Could not save selection range:', e);
        }
    }

    return text;
}

// Detect if we're in Google Docs
function isGoogleDocs() {
    return window.location.hostname === 'docs.google.com' &&
        window.location.pathname.includes('/document/');
}

// Detect if we're in Google Sheets
function isGoogleSheets() {
    return window.location.hostname === 'docs.google.com' &&
        window.location.pathname.includes('/spreadsheets/');
}

// Detect if we're in Google Slides
function isGoogleSlides() {
    return window.location.hostname === 'docs.google.com' &&
        window.location.pathname.includes('/presentation/');
}

// Detect if we're in any Google Workspace app
function isGoogleWorkspace() {
    return isGoogleDocs() || isGoogleSheets() || isGoogleSlides();
}

// Detect if we're in Outlook
function isOutlook() {
    return window.location.hostname.includes('outlook.live.com') ||
        window.location.hostname.includes('outlook.office365.com') ||
        window.location.hostname.includes('outlook.office.com');
}

// Get text from Google Docs properly
async function getGoogleDocsSelectedText() {
    let text = window.getSelection().toString().trim();

    if (!text) {
        text = await getGoogleDocsAccessibleText();
    }

    return text;
}

// Real Google Docs text extraction via Accessibility API
async function getGoogleDocsAccessibleText() {
    return new Promise(resolve => {
        try {
            chrome.runtime.sendMessage({ action: "getGoogleDocsSelection" }, response => {
                resolve(response?.text || "");
            });
        } catch (err) {
            console.warn("GDocs accessibility failed:", err);
            resolve("");
        }
    });
}

// Get all page content for Google Docs - IMPROVED VERSION WITH CACHING
function getGoogleDocsPageContent() {
    try {
        // Method 1: Main document content
        const pageContent = document.querySelector('.kix-paginateddocumentplugin');
        if (pageContent) {
            const text = pageContent.innerText || pageContent.textContent || '';
            if (text.trim().length > 50) {
                lastPageContent = text.trim();
                console.log('✓ Got Google Docs content (Method 1), length:', text.length);
                return text.trim();
            }
        }

        // Method 2: Alternative selector
        const contentWrapper = document.querySelector('.kix-page-content-wrapper');
        if (contentWrapper) {
            const text = contentWrapper.innerText || contentWrapper.textContent || '';
            if (text.trim().length > 50) {
                lastPageContent = text.trim();
                console.log('✓ Got Google Docs content (Method 2), length:', text.length);
                return text.trim();
            }
        }

        // Method 3: All pages
        const pages = document.querySelectorAll('.kix-page');
        if (pages.length > 0) {
            let allText = '';
            pages.forEach(page => {
                const text = page.innerText || page.textContent || '';
                allText += text + '\n';
            });
            if (allText.trim().length > 50) {
                lastPageContent = allText.trim();
                console.log('✓ Got Google Docs content (Method 3), length:', allText.length);
                return allText.trim();
            }
        }

        // Return cached content if available
        if (lastPageContent && lastPageContent.length > 50) {
            console.log('✓ Using cached Google Docs content, length:', lastPageContent.length);
            return lastPageContent;
        }

        console.warn('⚠️ Could not extract Google Docs content');
        return '';
    } catch (err) {
        console.error("❌ Error getting Google Docs page content:", err);
        return lastPageContent || '';
    }
}

// Get all page content for Google Slides
function getGoogleSlidesPageContent() {
    try {
        // Method 1: Try to get text from current slide
        const slideContent = document.querySelector('.punch-viewer-content');
        if (slideContent) {
            const text = slideContent.innerText || slideContent.textContent || '';
            if (text.trim().length > 10) {
                console.log('✓ Got Google Slides content (Method 1), length:', text.length);
                return text.trim();
            }
        }

        // Method 2: Try to get from all visible text boxes
        const textBoxes = document.querySelectorAll('[role="textbox"], .sketchy-text-content-wrapper');
        if (textBoxes.length > 0) {
            let allText = '';
            textBoxes.forEach(box => {
                const text = box.innerText || box.textContent || '';
                allText += text + '\n';
            });
            if (allText.trim().length > 10) {
                console.log('✓ Got Google Slides content (Method 2), length:', allText.length);
                return allText.trim();
            }
        }

        // Method 3: Try general body text
        const body = document.body;
        if (body) {
            const text = body.innerText || body.textContent || '';
            if (text.trim().length > 10) {
                console.log('✓ Got Google Slides content (Method 3), length:', text.length);
                return text.trim();
            }
        }

        console.warn('⚠️ Could not extract Google Slides content');
        return '';
    } catch (err) {
        console.error("❌ Error getting Google Slides page content:", err);
        return '';
    }
}


// Continuously update page content cache for Google Docs
if (isGoogleDocs()) {
    setInterval(() => {
        const content = getGoogleDocsPageContent();
        if (content) {
            lastPageContent = content;
        }
    }, 2000); // Update every 2 seconds
}

// Enhanced selection capture that works in Google Docs and Outlook
function captureSelectionAggressively() {
    let text = '';

    // Special handling for Google Docs
    if (isGoogleDocs()) {
        const selection = window.getSelection();
        text = selection.toString().trim();
    } else {
        const selection = window.getSelection();
        text = selection.toString().trim();
    }

    if (text && text.length > 0) {
        selectedText = text;
        lastKnownSelection = text;

        // Save selection data more aggressively
        try {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                selectionRange = selection.getRangeAt(0).cloneRange();
            }
            lastActiveElement = document.activeElement;

            // For Google Docs/Outlook - store additional context
            if (isGoogleWorkspace() || isOutlook()) {
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    lastSelectionData = {
                        element: document.activeElement,
                        range: range.cloneRange(),
                        text: text,
                        timestamp: Date.now()
                    };
                }
            }
        } catch (e) {
            console.log('Selection capture warning:', e);
        }

        return text;
    }

    return '';
}

// Handle menu action - ENHANCED VERSION
async function handleMenuAction(action, providedText = '', pageContent = '', pageTitle = '', pageUrl = '') {
    console.log('=== handleMenuAction START ===');
    console.log('Action:', action);
    console.log('providedText length:', providedText?.length || 0);
    console.log('pageContent length:', pageContent?.length || 0);
    console.log('selectedText:', selectedText);
    console.log('lastKnownSelection:', lastKnownSelection);

    menuActionTriggered = true;

    // Determine the text to use with better priority logic
    let textToUse = '';

    // For page-level actions, we might not need selected text
    const isPageAction = action === 'explain-page' || action === 'chat-page';

    // Priority 1: Use provided text from context menu if available
    if (providedText && providedText.trim()) {
        textToUse = providedText.trim();
        selectedText = textToUse;
        lastKnownSelection = textToUse;
        console.log('✓ Using provided text from context menu');
    }
    // Priority 2: Try to get fresh selection
    else if (!isPageAction) {
        let freshText = '';
        if (isGoogleDocs()) {
            // For Google Docs, try window.getSelection() first
            freshText = window.getSelection().toString().trim();
            console.log('Google Docs selection:', freshText?.substring(0, 50));
        } else {
            freshText = getSelectedText();
        }

        if (freshText) {
            textToUse = freshText;
            selectedText = freshText;
            lastKnownSelection = freshText;
            console.log('✓ Got fresh selection');
        }
        // Priority 3: Use last known selection
        else if (lastKnownSelection) {
            textToUse = lastKnownSelection;
            selectedText = lastKnownSelection;
            console.log('✓ Using lastKnownSelection');
        }
    }

    // For Google Docs, ALWAYS ensure we have page content
    if (isGoogleDocs()) {
        if (!pageContent || pageContent.length < 100) {
            const freshPageContent = getGoogleDocsPageContent();
            if (freshPageContent) {
                pageContent = freshPageContent;
                console.log('✓ Got fresh Google Docs page content:', pageContent.substring(0, 100));
            } else if (lastPageContent) {
                pageContent = lastPageContent;
                console.log('✓ Using cached Google Docs page content');
            }
        }
    }

    // Verify we have text for non-chat/non-page actions
    if (!textToUse && !isPageAction && action !== 'chat') {
        console.error('❌ No text found for action:', action);
        showTemporaryNotification('⚠️ No text selected. Please select text and try again.');
        menuActionTriggered = false;
        return;
    }

    // For chat/page actions: if no text selected, use page content
    const finalText = textToUse || pageContent;

    console.log('=== FINAL DATA ===');
    console.log('finalText length:', finalText?.length || 0);
    console.log('finalText preview:', finalText?.substring(0, 100));
    console.log('pageContent length:', pageContent?.length || 0);
    console.log('==================');

    // Check if in-place editing is enabled (except for certain actions)
    const config = await chrome.storage.sync.get(['inPlaceEditing']);
    const sidebarOnlyActions = ['summarize', 'check-grammar', 'chat', 'explain-page'];
    const inPlaceEditing = config.inPlaceEditing !== false && 
                          !sidebarOnlyActions.includes(action) && 
                          !isPageAction;

    if (inPlaceEditing) {
        showLoadingIndicator();
    }

    // Send message to background script
    console.log('Sending to background:', {
        action,
        textLength: finalText?.length || 0,
        pageContentLength: pageContent?.length || 0,
        inPlaceEditing
    });

    chrome.runtime.sendMessage({
        action: action,
        text: finalText,
        source: 'content-script',
        inPlaceEditing: inPlaceEditing,
        pageContent: pageContent,
        pageTitle: pageTitle,
        pageUrl: pageUrl
    });

    if (!inPlaceEditing) {
        // Don't clear selection for sidebar actions - user might want to reference it
        // selectedText = '';
        // lastActiveElement = null;
        // lastSelectionData = null;
    }

    // Reset flag after a short delay
    setTimeout(() => {
        menuActionTriggered = false;
    }, 1000);
}

// Show loading indicator
function showLoadingIndicator() {
    hideLoadingIndicator();
    const indicator = document.createElement('div');
    indicator.id = 'openwebui-loading';
    indicator.className = 'openwebui-loading';
    indicator.textContent = '⏳ Processing with AI...';
    document.body.appendChild(indicator);
}

// Hide loading indicator
function hideLoadingIndicator() {
    const indicator = document.getElementById('openwebui-loading');
    if (indicator) {
        indicator.remove();
    }
}

// Custom context menu for Google Workspace / Outlook
let customMenu;

// Remove custom menu
function removeCustomMenu() {
    if (customMenu) {
        customMenu.remove();
    }
    customMenu = null;
}

// Create custom context menu
function createCustomMenu(e, text) {
    removeCustomMenu();

    customMenu = document.createElement('div');
    customMenu.className = 'openwebui-custom-menu';
    customMenu.style.position = 'fixed';
    customMenu.style.pointerEvents = 'auto'; // Ensure it can receive clicks

    // Position menu to the LEFT of the cursor to avoid overwriting default menus
    const menuWidth = 160;
    const offsetX = menuWidth + 10; // Position to the left with some spacing
    const offsetY = 0;

    let menuX = e.clientX - offsetX;
    let menuY = e.clientY + offsetY;

    // Ensure menu stays on screen
    if (menuX < 10) {
        menuX = 10;
    }
    if (menuY + 300 > window.innerHeight) {
        menuY = window.innerHeight - 310;
    }

    customMenu.style.top = menuY + 'px';
    customMenu.style.left = menuX + 'px';

    customMenu.style.background = '#222';
    customMenu.style.color = '#fff';
    customMenu.style.padding = '6px 10px';
    customMenu.style.borderRadius = '4px';
    customMenu.style.zIndex = '0';
    customMenu.style.fontSize = '13px';
    customMenu.style.cursor = 'pointer';
    customMenu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    customMenu.style.minWidth = '150px';
    customMenu.style.display = 'block'; // Force display
    customMenu.style.visibility = 'visible'; // Force visibility

    const actions = [
        { id: 'summarize', label: '📄 Summarize' },
        { id: 'rewrite', label: '✏️ Rewrite' },
        { id: 'check-grammar', label: '🔍 Check Grammar' },
        { id: 'fix-grammar', label: '✓ Fix Grammar' },
        { id: 'expand', label: '📈 Expand' },
        { id: 'shorten', label: '📉 Shorten' },
        { id: 'chat', label: '💬 Chat' }
    ];

    actions.forEach((a, index) => {
        const item = document.createElement('div');
        item.textContent = a.label;
        item.style.padding = '6px 8px';
        item.style.borderRadius = '3px';
        item.style.transition = 'background 0.2s';
        item.style.pointerEvents = 'auto'; // Ensure clickable

        if (index < actions.length - 1) {
            item.style.borderBottom = '1px solid #444';
        }

        item.addEventListener('mouseenter', () => {
            item.style.background = '#444';
        });

        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });

        item.addEventListener('mousedown', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            removeCustomMenu();
            selectedText = text;
            handleMenuAction(a.id, text);
        });

        customMenu.appendChild(item);
    });

    // Append to body (not document.body in case of iframes)
    document.body.appendChild(customMenu);

    // Force reflow to ensure it renders
    customMenu.offsetHeight;

    console.log('✓ Custom menu created at', menuX, menuY, 'with text:', text.substring(0, 30));
}



// Inject into Google Docs native menu
// Inject into Google Docs native menu
// Inject into Google Docs/Slides native menu
function injectIntoGoogleWorkspaceMenu() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                // Look for Google's context menu
                if (node.classList && node.classList.contains('goog-menu')) {
                    // Check if we already injected
                    if (node.querySelector('.openwebui-injected')) {
                        console.log('⏭️ Already injected, skipping');
                        return;
                    }

                    console.log('✅ Found Google Workspace menu, injecting items...');

                    // Create separator
                    const separator = document.createElement('div');
                    separator.className = 'apps-hoverable-menu-separator-container openwebui-injected';
                    separator.setAttribute('role', 'separator');
                    separator.style.userSelect = 'none';
                    separator.innerHTML = '<div class="apps-hoverable-menu-separator-top"></div><div class="apps-hoverable-menu-separator-bottom"></div>';

                    // Create our menu items
                    const menuItems = [
                        { id: 'summarize', label: '📄 Summarize' },
                        { id: 'rewrite', label: '✏️ Rewrite' },
                        { id: 'check-grammar', label: '🔍 Check Grammar' },
                        { id: 'fix-grammar', label: '✓ Fix Grammar' },
                        { id: 'expand', label: '📈 Expand' },
                        { id: 'shorten', label: '📉 Shorten' },
                        { id: 'chat', label: '💬 Chat' }
                    ];

                    // Insert separator at top
                    node.insertBefore(separator, node.firstChild);

                    // Insert each menu item
                    menuItems.forEach((item) => {
                        const menuItem = document.createElement('div');
                        menuItem.className = 'goog-menuitem apps-menuitem openwebui-injected';
                        menuItem.setAttribute('role', 'menuitem');
                        menuItem.style.userSelect = 'none';

                        menuItem.innerHTML = `
                            <div class="goog-menuitem-content">
                                <span class="goog-menuitem-label">${item.label}</span>
                            </div>
                        `;

                        // Add hover effect
                        menuItem.addEventListener('mouseenter', () => {
                            menuItem.classList.add('goog-menuitem-highlight');
                        });
                        menuItem.addEventListener('mouseleave', () => {
                            menuItem.classList.remove('goog-menuitem-highlight');
                        });

                        // Add click handler - OPTIMIZED COMBINED APPROACH (works for both Docs and Slides)
                        menuItem.addEventListener('click', async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('🖱️ Menu item clicked:', item.id);

                            // IMMEDIATE CAPTURE: Grab selection synchronously before ANY async operations
                            const immediateSelection = window.getSelection().toString().trim();
                            if (immediateSelection) {
                                lastKnownSelection = immediateSelection;
                                console.log('💾 Captured immediate selection:', immediateSelection.substring(0, 50));
                            }

                            // Hide the Google native menu so the editor can regain focus
                            try {
                                node.style.display = 'none';
                            } catch (err) {
                                console.warn('⚠️ Could not hide menu container:', err);
                            }

                            // Helper: Focus the editor iframe or editable canvas
                            function focusEditor() {
                                // For Google Docs
                                let frame = document.querySelector('iframe.docs-texteventtarget-iframe');
                                if (frame && frame.contentWindow) {
                                    try {
                                        frame.contentWindow.focus();
                                        frame.focus();
                                        console.log('✅ Focused docs-texteventtarget-iframe');
                                        return frame;
                                    } catch (e) {
                                        console.warn('⚠️ iframe focus failed:', e);
                                    }
                                }

                                // For Google Slides - try punch-viewer-editor or slides-specific selectors
                                frame = document.querySelector('iframe.punch-viewer-editor, iframe.punch-present-iframe');
                                if (frame && frame.contentWindow) {
                                    try {
                                        frame.contentWindow.focus();
                                        frame.focus();
                                        console.log('✅ Focused Slides editor iframe');
                                        return frame;
                                    } catch (e) {
                                        console.warn('⚠️ Slides iframe focus failed:', e);
                                    }
                                }

                                // Fallback: try focusing the canvas element
                                const canvas = document.querySelector('.kix-appview-editor, .kix-appview-editor-container, .punch-viewer-container, .punch-viewer-content');
                                if (canvas) {
                                    try {
                                        canvas.focus?.();
                                        console.log('✅ Focused canvas element');
                                        return null;
                                    } catch (e) {
                                        console.warn('⚠️ canvas focus failed:', e);
                                    }
                                }

                                console.warn('⚠️ Could not find editor to focus');
                                return null;
                            }

                            // Helper: Execute copy inside a frame (if found) or in current context
                            async function execCopyInEditor(frame) {
                                // If we have a frame object, attempt execCommand('copy') in that frame's document
                                try {
                                    if (frame && frame.contentDocument) {
                                        const doc = frame.contentDocument;
                                        // Focus contentWindow first
                                        try { frame.contentWindow.focus(); } catch (_) { }
                                        const ok = doc.execCommand && doc.execCommand('copy');
                                        console.log('✂️ execCommand(copy) in iframe returned:', ok);
                                        return ok;
                                    }
                                } catch (e) {
                                    console.warn('⚠️ execCommand in iframe failed:', e);
                                }

                                // Fallback: try execCommand in current document
                                try {
                                    const ok = document.execCommand && document.execCommand('copy');
                                    console.log('✂️ execCommand(copy) in parent returned:', ok);
                                    return ok;
                                } catch (e) {
                                    console.warn('⚠️ execCommand in parent failed:', e);
                                    return false;
                                }
                            }

                            try {
                                // Step 1: Store user's current clipboard (best-effort)
                                let originalClipboard = '';
                                try {
                                    originalClipboard = await navigator.clipboard.readText();
                                    console.log('💾 Saved original clipboard');
                                } catch (err) {
                                    console.log('⚠️ Could not read original clipboard (non-fatal):', err);
                                    originalClipboard = '';
                                }

                                // Step 2: Re-focus the editor so the blue selection reappears
                                const frame = focusEditor();

                                // Small delay to let the app re-render selection after menu hide
                                await new Promise(resolve => setTimeout(resolve, 50));

                                // Step 3: Try to run the browser copy command
                                let copySucceeded = false;
                                try {
                                    copySucceeded = await execCopyInEditor(frame);
                                } catch (err) {
                                    console.warn('⚠️ Copy attempt threw:', err);
                                    copySucceeded = false;
                                }

                                // Step 4: If execCommand didn't work, retry once after another delay
                                if (!copySucceeded) {
                                    console.log('🔄 First copy failed, retrying...');
                                    await new Promise(resolve => setTimeout(resolve, 80));
                                    try {
                                        copySucceeded = await execCopyInEditor(frame);
                                    } catch (err) {
                                        console.warn('⚠️ Second copy attempt threw:', err);
                                    }
                                }

                                // Step 5: Read the clipboard to get the copied text
                                let copiedText = '';
                                try {
                                    copiedText = await navigator.clipboard.readText();
                                    console.log('📋 Read from clipboard, length:', copiedText.length);
                                } catch (err) {
                                    console.warn('⚠️ Could not read clipboard after copy:', err);
                                    copiedText = '';
                                }

                                // Step 6: Fallback chain if clipboard is empty
                                if (!copiedText || copiedText.trim().length === 0) {
                                    console.log('⚠️ Clipboard empty, trying fallbacks...');

                                    // Fallback 1: Use our immediate capture
                                    if (lastKnownSelection && lastKnownSelection.length > 0) {
                                        copiedText = lastKnownSelection;
                                        console.log('✅ Using lastKnownSelection, length:', copiedText.length);
                                    }
                                    // Fallback 2: Try window.getSelection() in parent
                                    else {
                                        try {
                                            const sel = window.getSelection();
                                            if (sel && sel.toString && sel.toString().trim().length > 0) {
                                                copiedText = sel.toString().trim();
                                                console.log('✅ Using window.getSelection()');
                                            }
                                            // Fallback 3: Try getSelection() inside iframe
                                            else if (frame && frame.contentWindow && frame.contentWindow.getSelection) {
                                                const sel2 = frame.contentWindow.getSelection();
                                                if (sel2 && sel2.toString && sel2.toString().trim().length > 0) {
                                                    copiedText = sel2.toString().trim();
                                                    console.log('✅ Using iframe.getSelection()');
                                                }
                                            }
                                        } catch (e) {
                                            console.warn('⚠️ Selection fallback failed:', e);
                                        }
                                    }
                                }

                                // Step 7: Verify we have text before sending
                                if (!copiedText || copiedText.trim().length === 0) {
                                    console.error('❌ No text captured after all attempts!');
                                    showTemporaryNotification('⚠️ No text selected. Please select text and try again.');
                                    return;
                                }

                                // Step 8: Get page content for context
                                let pageContent = '';
                                if (isGoogleDocs()) {
                                    pageContent = getGoogleDocsPageContent();
                                } else if (isGoogleSlides()) {
                                    pageContent = getGoogleSlidesPageContent();
                                }

                                // Step 9: Send to background script for AI processing
                                console.log('✅ Sending to background, action:', item.id, 'text length:', copiedText.length);
                                chrome.runtime.sendMessage({
                                    action: item.id,
                                    source: 'content-script',
                                    text: copiedText,
                                    pageContent: pageContent,
                                    pageTitle: document.title,
                                    pageUrl: window.location.href,
                                    inPlaceEditing: item.id !== 'summarize' && item.id !== 'check-grammar' && item.id !== 'chat'
                                });

                                // Step 10: Restore original clipboard (delayed to avoid interfering with AI processing)
                                if (originalClipboard !== '') {
                                    setTimeout(async () => {
                                        try {
                                            await navigator.clipboard.writeText(originalClipboard);
                                            console.log('♻️ Restored original clipboard');
                                        } catch (err) {
                                            console.warn('⚠️ Could not restore clipboard:', err);
                                        }
                                    }, 500);
                                }

                            } catch (err) {
                                console.error('❌ Error in menu click workflow:', err);

                                // Final fallback: send whatever we captured immediately
                                const fallback = lastKnownSelection || immediateSelection || window.getSelection().toString().trim() || '';
                                if (fallback && fallback.length > 0) {
                                    console.log('🆘 Using emergency fallback, length:', fallback.length);
                                    chrome.runtime.sendMessage({
                                        action: item.id,
                                        source: 'content-script',
                                        text: fallback,
                                        inPlaceEditing: item.id !== 'summarize' && item.id !== 'check-grammar' && item.id !== 'chat'
                                    });
                                } else {
                                    showTemporaryNotification('⚠️ Error capturing text. Please try again.');
                                }
                            }
                        });

                        node.insertBefore(menuItem, separator);
                    });

                    console.log('✅ Injected', menuItems.length, 'menu items!');
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('👀 Watching for Google Workspace menu...');
}


// Start the injection observer for Google Docs and Slides
if (isGoogleDocs() || isGoogleSlides()) {
    injectIntoGoogleWorkspaceMenu();
}



// Context menu event handler - FOR GOOGLE DOCS, DON'T SHOW CUSTOM MENU
// Let Chrome's native menu handle it, and background.js will process the selection
document.addEventListener('contextmenu', (e) => {
    // ONLY show custom menu for Sheets and Outlook (NOT Google Docs)
    if (!isGoogleSheets() && !isOutlook()) {
        return;
    }

    // If Shift is held, allow the default browser context menu
    if (e.shiftKey) {
        removeCustomMenu();
        return;
    }

    // Get selected text
    let text = window.getSelection().toString().trim();
    if (text) {
        selectedText = text;
        lastKnownSelection = text;
    }

    // Only show custom menu if there's selected text
    if (text && text.length > 0) {
        createCustomMenu(e, text);
    } else {
        removeCustomMenu();
    }
}, true);





// Remove menu when clicking anywhere
document.addEventListener('mousedown', (e) => {
    // Don't remove if clicking inside the custom menu
    if (customMenu && customMenu.contains(e.target)) {
        return;
    }
    removeCustomMenu();
}, true);

// Listen for text selection on main document
document.addEventListener('mouseup', (e) => {
    // ONLY update selection - NEVER trigger AI actions
    setTimeout(() => {
        let text = '';
        if (isGoogleDocs()) {
            const selection = window.getSelection();
            text = selection.toString().trim();
        } else {
            text = getSelectedText();
        }

        if (text && text.length > 0) {
            selectedText = text;
            lastKnownSelection = text;
        }
    }, 50);
});

// Selection change listener - ENHANCED FOR GOOGLE DOCS
document.addEventListener('selectionchange', () => {
    console.log('📌 selectionchange event fired in frame:', window.location.href);

    if (isGoogleWorkspace() || isOutlook()) {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        console.log('📌 Selection text:', text ? text.substring(0, 50) : 'NONE');

        if (text && text.length > 0) {
            selectedText = text;
            lastKnownSelection = text;
            console.log('✅ Saved selection in THIS frame:', text.substring(0, 50));

            // Broadcast to parent frame
            try {
                window.parent.postMessage({
                    type: 'GOOGLE_DOCS_SELECTION',
                    text: text
                }, '*');
            } catch (e) {
                console.log('Could not post to parent:', e);
            }
        }
    }
});

// Listen for selection messages from child frames (for Google Docs)
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GOOGLE_DOCS_SELECTION') {
        const text = event.data.text;
        if (text && text.length > 0) {
            selectedText = text;
            lastKnownSelection = text;
            console.log('✅ Received selection from child frame:', text.substring(0, 50));
        }
    }
});

// ADDITIONAL: Mouse-based selection capture for Google Docs
// ADDITIONAL: Mouse-based selection capture for Google Docs and Slides
if (isGoogleDocs() || isGoogleSlides()) {
    console.log('🔧 Setting up Google Workspace selection tracking in frame:', window.location.href);

    // Capture on mousedown (RIGHT CLICK) before menu opens
    document.addEventListener('mousedown', (e) => {
        // Only on right-click (button 2)
        if (e.button === 2) {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text && text.length > 0) {
                selectedText = text;
                lastKnownSelection = text;
                console.log('🖱️ RIGHT-CLICK captured selection:', text.substring(0, 50));
            }
        }
    }, true);

    document.addEventListener('mouseup', () => {
        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text && text.length > 0) {
                selectedText = text;
                lastKnownSelection = text;
                console.log('🖱️ Mouseup captured selection:', text.substring(0, 50));

                // Broadcast to all frames
                try {
                    window.parent.postMessage({
                        type: 'GOOGLE_DOCS_SELECTION',
                        text: text
                    }, '*');
                } catch (e) { }
            }
        }, 50);
    }, true);
}


// Listen for keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        const text = getSelectedText();
        if (text) {
            selectedText = text;
            handleMenuAction('grammar', text);
        }
    }
});

// Handle messages from background/sidepanel - ENHANCED VERSION
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('=== Content script received message ===');
    console.log('Message:', message);

    if (message.action === 'ping') {
        console.log('✓ Ping received, responding');
        sendResponse({ success: true });
        return true;
    }

    if (message.action === 'triggerMenuAction') {
        console.log('=== triggerMenuAction received ===');
        console.log('menuAction:', message.menuAction);
        console.log('selectedText length:', message.selectedText?.length || 0);
        console.log('pageContent length:', message.pageContent?.length || 0);

        let textToUse = message.selectedText || '';

        if (!textToUse && isGoogleWorkspace() && lastKnownSelection) {
            textToUse = lastKnownSelection;
            console.log('✓ Using lastKnownSelection for empty context menu selection');
        }

        let pageContent = message.pageContent || '';
        if (isGoogleDocs()) {
            const freshPageContent = getGoogleDocsPageContent();
            if (freshPageContent && freshPageContent.length > pageContent.length) {
                pageContent = freshPageContent;
                console.log('✓ Using fresh Google Docs page content');
            } else if (lastPageContent && lastPageContent.length > pageContent.length) {
                pageContent = lastPageContent;
                console.log('✓ Using cached Google Docs page content');
            }
        }

        console.log('=== Calling handleMenuAction ===');
        console.log('Final textToUse length:', textToUse?.length || 0);
        console.log('Final pageContent length:', pageContent?.length || 0);

        handleMenuAction(
            message.menuAction,
            textToUse,
            pageContent,
            message.pageTitle || '',
            message.pageUrl || ''
        );

        sendResponse({ success: true });
    } else if (message.action === 'insertText' && message.text) {
        hideLoadingIndicator();
        const success = insertTextAtSelection(message.text);

        // ONLY show notification if insertion SUCCEEDED via direct methods
        // (clipboard fallback already shows its own notification)
        if (success && !message.text.includes('clipboard')) {
            showTemporaryNotification('✅ Text updated!');
        }

        sendResponse({ success: success });
    } else if (message.action === 'showError' && message.message) {
        hideLoadingIndicator();
        showTemporaryNotification(`Error: ${message.message}`);
        sendResponse({ success: true });
    }
    return true;
});

// Enhanced insert text function with multiple fallback methods
function insertTextAtSelection(text) {
    selectedText = '';
    let insertSuccess = false;

    try {
        // Method 1: Try saved selection data for input/textarea (most reliable)
        if (lastSelectionData && lastSelectionData.element &&
            (lastSelectionData.element.tagName === 'TEXTAREA' || lastSelectionData.element.tagName === 'INPUT')) {
            try {
                const el = lastSelectionData.element;
                el.focus();
                const start = lastSelectionData.start;
                const end = lastSelectionData.end;
                const value = el.value;
                el.value = value.substring(0, start) + text + value.substring(end);
                el.selectionStart = el.selectionEnd = start + text.length;

                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));

                lastSelectionData = null;
                lastActiveElement = null;
                selectionRange = null;

                return true;
            } catch (e) {
                console.log('Method 1 (saved data) failed:', e);
            }
        }

        // Method 2: Try using saved selection range with execCommand
        if (selectionRange) {
            try {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(selectionRange);

                if (document.execCommand('insertText', false, text)) {
                    selectionRange = null;
                    lastActiveElement = null;
                    return true;
                }
            } catch (e) {
                console.log('Method 2 (execCommand with saved range) failed:', e);
            }
        }

        // Method 3: Try current active element if it's input/textarea
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
            try {
                const start = activeElement.selectionStart || 0;
                const end = activeElement.selectionEnd || 0;
                const value = activeElement.value || '';
                activeElement.value = value.substring(0, start) + text + value.substring(end);
                activeElement.selectionStart = activeElement.selectionEnd = start + text.length;
                activeElement.focus();

                activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                activeElement.dispatchEvent(new Event('change', { bubbles: true }));

                selectionRange = null;
                lastActiveElement = null;
                return true;
            } catch (e) {
                console.log('Method 3 (current active element) failed:', e);
            }
        }

        // Method 4: Try contenteditable elements
        if (activeElement && activeElement.isContentEditable) {
            try {
                activeElement.focus();
                if (document.execCommand('insertText', false, text)) {
                    selectionRange = null;
                    lastActiveElement = null;
                    return true;
                }
            } catch (e) {
                console.log('Method 4 (contenteditable) failed:', e);
            }
        }

        // Method 5: Try to find last active element from our saved reference
        if (lastActiveElement) {
            try {
                lastActiveElement.focus();

                if (lastActiveElement.tagName === 'TEXTAREA' || lastActiveElement.tagName === 'INPUT') {
                    const start = lastActiveElement.selectionStart || lastActiveElement.value.length;
                    const end = lastActiveElement.selectionEnd || start;
                    const value = lastActiveElement.value || '';
                    lastActiveElement.value = value.substring(0, start) + text + value.substring(end);
                    lastActiveElement.selectionStart = lastActiveElement.selectionEnd = start + text.length;

                    lastActiveElement.dispatchEvent(new Event('input', { bubbles: true }));
                    lastActiveElement.dispatchEvent(new Event('change', { bubbles: true }));

                    selectionRange = null;
                    lastActiveElement = null;
                    return true;
                } else if (lastActiveElement.isContentEditable) {
                    if (document.execCommand('insertText', false, text)) {
                        selectionRange = null;
                        lastActiveElement = null;
                        return true;
                    }
                }
            } catch (e) {
                console.log('Method 5 (last active element) failed:', e);
            }
        }

        // Method 6: Fallback - copy to clipboard and SHOW notification (failure case)
        console.log('All insertion methods failed, falling back to clipboard');
        navigator.clipboard.writeText(text).then(() => {
            showTemporaryNotification('📋 AI response copied to clipboard! Press Ctrl+V to paste.');
            selectionRange = null;
            lastActiveElement = null;
            lastSelectionData = null;
            insertSuccess = true;
        }).catch((err) => {
            console.error('Clipboard write failed:', err);
            //showTemporaryNotification('⚠️ Could not insert text 716. Please open the side panel to copy manually.');
            selectionRange = null;
            lastActiveElement = null;
            lastSelectionData = null;
        });

        return insertSuccess;

    } catch (e) {
        console.error('Error inserting text:', e);
        // Final fallback - try clipboard one more time with notification
        try {
            navigator.clipboard.writeText(text).then(() => {
                showTemporaryNotification('📋 AI response copied to clipboard! Press Ctrl+V to paste.');
            }).catch(() => {
                showTemporaryNotification('⚠️ Could not insert text 731. Please open the side panel to copy manually.');
            });
        } catch (clipErr) {
            showTemporaryNotification('⚠️ Could not insert text 734. Please open the side panel to copy manually.');
        }

        selectionRange = null;
        lastActiveElement = null;
        lastSelectionData = null;
        return false;
    }
}
// Show temporary notification
function showTemporaryNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'openwebui-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 4000);
}

console.log('Open WebUI Assistant loaded - Google Workspace & Outlook compatible');

// Google Workspace specific initialization - wait for full load
if (isGoogleDocs() || isGoogleSlides()) {
    const appName = isGoogleDocs() ? 'Google Docs' : 'Google Slides';
    console.log(`${appName} detected - waiting for full initialization...`);

    // Wait for app to fully load before setting up listeners
    const waitForApp = setInterval(() => {
        const canvas = document.querySelector('.kix-appview-editor, .punch-viewer-content');
        if (canvas) {
            console.log(`✓ ${appName} fully loaded, custom menu ready`);
            clearInterval(waitForApp);
        }
    }, 500);

    // Also ensure menu is re-created on any Google Docs UI updates
    const observer = new MutationObserver(() => {
        // Just observe, our existing contextmenu listener will handle it
    });

    const observeTarget = document.body;
    if (observeTarget) {
        observer.observe(observeTarget, { childList: true, subtree: true });
    }
}