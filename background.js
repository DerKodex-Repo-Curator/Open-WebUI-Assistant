// Store the last selection data per tab
const tabSelections = new Map();

// FIX #2: Track if we're already processing a request to prevent duplicates
const processingTabs = new Set();

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'openwebui-parent',
        title: 'Open WebUI Assistant',
        contexts: ['selection', 'page']
    });

    // These appear when text is selected
    chrome.contextMenus.create({
        id: 'summarize',
        parentId: 'openwebui-parent',
        title: '📄 Summarize',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'rewrite',
        parentId: 'openwebui-parent',
        title: '✏️ Rewrite',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'check-grammar',
        parentId: 'openwebui-parent',
        title: '🔍 Check Grammar',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'fix-grammar',
        parentId: 'openwebui-parent',
        title: '✓ Fix Grammar',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'expand',
        parentId: 'openwebui-parent',
        title: '📈 Expand',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'shorten',
        parentId: 'openwebui-parent',
        title: '📉 Shorten',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'chat',
        parentId: 'openwebui-parent',
        title: '💬 Chat',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'separator',
        parentId: 'openwebui-parent',
        type: 'separator',
        contexts: ['page']
    });

    // This one always shows (even without selection)
    chrome.contextMenus.create({
        id: 'explain-page',
        parentId: 'openwebui-parent',
        title: '📖 Explain This Page',
        contexts: ['page']
    });
});


// UNIFIED AI PROCESSING - SINGLE SOURCE OF TRUTH
async function processAIAction(action, text, context) {
    console.log('=== 🤖 processAIAction called ===');
    console.log('Action:', action);
    console.log('Text length:', text?.length || 0);
    console.log('Context:', context);

    try {
        const config = await chrome.storage.sync.get(['baseUrl', 'username', 'password', 'selectedModel', 'authToken']);

        if (!config.baseUrl || !config.username || !config.password) {
            throw new Error('Please configure the extension in settings');
        }

        // Authenticate if needed
        let token = config.authToken;
        if (!token) {
            const authResponse = await fetch(`${config.baseUrl}/api/v1/auths/signin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: config.username, password: config.password })
            });

            if (!authResponse.ok) throw new Error('Authentication failed');

            const authData = await authResponse.json();
            token = authData.token;
            await chrome.storage.sync.set({ authToken: token });
        }

        // Build prompt - CONSISTENT ACROSS ALL USES
        let prompt = '';
        switch (action) {
            case 'summarize':
                prompt = `Please provide a concise summary of the following text:\n\n${text}`;
                break;
            case 'rewrite':
                prompt = `Rewrite the following text to improve clarity and flow. Provide ONLY the rewritten text with no preamble or explanation:\n\n${text}`;
                break;
            case 'check-grammar':
                prompt = `Please carefully review the following text for spelling and grammar errors. List any errors you find with explanations and suggestions:\n\n${text}`;
                break;
            case 'fix-grammar':
                prompt = `Correct any spelling and grammar errors in the following text. Provide ONLY the corrected text with no preamble, explanation, or additional commentary:\n\n${text}`;
                break;
            case 'expand':
                prompt = `Rewrite the following text to make it approximately 25% longer while keeping the same tone, style, and meaning. Provide ONLY the expanded text with no preamble, explanation, or additional commentary:\n\n${text}`;
                break;
            case 'shorten':
                prompt = `Make the following text more concise while keeping the key points. Provide ONLY the shortened text with no preamble, explanation, or additional commentary:\n\n${text}`;
                break;
            case 'explain-page':
                prompt = `Please explain what this webpage is about:\n\nTitle: ${context.pageTitle}\n\nContent:\n${context.pageContent.substring(0, 8000)}`;
                break;
        }

        console.log('📤 Sending to AI...');

        // Send to AI
        const response = await fetch(`${config.baseUrl}/api/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: config.selectedModel,
                messages: [{ role: 'user', content: prompt }],
                stream: false
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                await chrome.storage.sync.set({ authToken: null });
                return await processAIAction(action, text, context);
            }
            throw new Error('Failed to get AI response');
        }

        const data = await response.json();
        const result = data.choices[0].message.content;
        
        console.log('✅ AI response received, length:', result?.length || 0);
        
        return result;

    } catch (error) {
        console.error('❌ AI processing error:', error);
        throw error;
    }
}

// Inject content script into tab if needed
async function ensureContentScript(tabId) {
    try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        return true;
    } catch (e) {
        console.log('Content script not found, injecting...');
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                files: ['content.js']
            });
            await chrome.scripting.insertCSS({
                target: { tabId: tabId, allFrames: true },
                files: ['content.css']
            });
            await new Promise(resolve => setTimeout(resolve, 100));
            return true;
        } catch (injectError) {
            console.error('Failed to inject content script:', injectError);
            return false;
        }
    }
}

// Get visible text from Google Docs
async function getGoogleDocsText(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            func: () => {
                const methods = [
                    () => document.querySelector('.kix-paginateddocumentplugin')?.innerText,
                    () => document.querySelector('.kix-page-content-wrapper')?.innerText,
                    () => {
                        const pages = document.querySelectorAll('.kix-page');
                        let text = '';
                        pages.forEach(page => text += (page.innerText || '') + '\n');
                        return text;
                    },
                    () => document.body.innerText
                ];

                for (const method of methods) {
                    try {
                        const text = method();
                        if (text && text.trim().length > 0) {
                            return text.trim();
                        }
                    } catch (e) {
                        continue;
                    }
                }
                return '';
            }
        });

        let longestText = '';
        for (const result of results) {
            if (result.result && result.result.length > longestText.length) {
                longestText = result.result;
            }
        }

        console.log('Got Google Docs text, length:', longestText.length);
        return longestText;
    } catch (e) {
        console.error('Error getting Google Docs text:', e);
        return '';
    }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log('=== 🖱️ Context menu clicked ===');
    console.log('Menu item:', info.menuItemId);
    console.log('info.selectionText:', info.selectionText);

    let action = info.menuItemId;

    if (action === 'separator') return;

    // CRITICAL FIX: For Google Docs, info.selectionText IS populated by Chrome!
    let selectedText = info.selectionText || '';

    console.log('📝 Selected text from Chrome:', selectedText ? selectedText.substring(0, 50) : 'NONE');

    // Get page content for page-level actions or Google Docs
    let pageContent = '';
    const isGoogleDocs = tab.url && tab.url.includes('docs.google.com/document');
    const needsPageContent = action === 'explain-page' || action === 'chat-page' || action === 'chat' || isGoogleDocs;

    if (isGoogleDocs) {
        pageContent = await getGoogleDocsText(tab.id);
        console.log('Got Google Docs page content, length:', pageContent.length);
    } else if (needsPageContent) {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: false },
                func: () => document.body.innerText
            });
            pageContent = results[0].result;
        } catch (e) {
            console.error('Could not get page content:', e);
        }
    }

    // Ensure content script is loaded
    const scriptLoaded = await ensureContentScript(tab.id);

    if (!scriptLoaded) {
        console.log('Could not load content script, opening side panel directly');
        await chrome.sidePanel.open({ windowId: tab.windowId });
        await new Promise(resolve => setTimeout(resolve, 500));

        chrome.runtime.sendMessage({
            action: action,
            text: selectedText || pageContent || '',
            pageContent: pageContent,
            pageTitle: tab.title,
            pageUrl: tab.url,
            fromContentScript: false,
            tabId: tab.id,
            inPlaceEditing: false
        });
        return;
    }

    // Try to send to content script
    try {
        console.log('📤 Sending to content script with selectedText:', selectedText ? selectedText.substring(0, 50) : 'NONE');
        await chrome.tabs.sendMessage(tab.id, {
            action: 'triggerMenuAction',
            menuAction: action,
            selectedText: selectedText,  // ← This should now have the text!
            pageContent: pageContent,
            pageTitle: tab.title,
            pageUrl: tab.url
        });
        console.log('✅ Message sent to content script successfully');
    } catch (e) {
        console.error('❌ Could not send to content script:', e);
        await chrome.sidePanel.open({ windowId: tab.windowId });
        await new Promise(resolve => setTimeout(resolve, 500));

        chrome.runtime.sendMessage({
            action: action,
            text: selectedText || pageContent || '',
            pageContent: pageContent,
            pageTitle: tab.title,
            pageUrl: tab.url,
            fromContentScript: false,
            tabId: tab.id,
            inPlaceEditing: false
        });
    }
});


// Extension icon click - open side panel
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ windowId: tab.windowId });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    console.log('=== 📨 Background received message ===');
    console.log('Message action:', message.action);
    console.log('Message source:', message.source);

    // Handle ping
    if (message.action === 'ping') {
        sendResponse({ success: true });
        return true;
    }

    // Handle selection storage
    if (message.action === 'storeSelection' && sender.tab) {
        tabSelections.set(sender.tab.id, {
            text: message.text,
            timestamp: Date.now()
        });
        sendResponse({ success: true });
        return true;
    }

    // Handle messages from content script
    if (message.source === 'content-script' && message.action) {
        console.log('=== 📝 Processing content-script message ===');
        console.log('Action:', message.action);
        console.log('Text length:', message.text?.length || 0);
        console.log('inPlaceEditing:', message.inPlaceEditing);

        const sidebarOnlyActions = ['summarize', 'check-grammar', 'chat', 'explain-page', 'chat-page'];

        if (message.inPlaceEditing && !sidebarOnlyActions.includes(message.action)) {
            // FIX #2: Check if already processing
            if (processingTabs.has(sender.tab.id)) {
                console.log('⚠️ Already processing for this tab, ignoring duplicate');
                sendResponse({ success: false, reason: 'duplicate' });
                return true;
            }

            // Mark as processing
            processingTabs.add(sender.tab.id);

            console.log('🔧 Processing IN-PLACE action:', message.action);
            try {
                const result = await processAIAction(message.action, message.text, {
                    pageTitle: message.pageTitle || sender.tab?.title || '',
                    pageUrl: message.pageUrl || sender.tab?.url || '',
                    pageContent: message.pageContent || ''
                });

                console.log('✅ Got AI result, length:', result?.length || 0);

                // Send to content script for insertion
                console.log('📤 Sending result back to content script...');
                await chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'insertText',
                    text: result
                });
                console.log('✅ Result sent to content script');

                // ALSO send to sidepanel so it shows the SAME result
                chrome.runtime.sendMessage({
                    action: 'displayResult',
                    result: result,
                    originalAction: message.action,
                    originalText: message.text
                }).catch(() => {
                    console.log('Sidepanel not open, skipping');
                });

            } catch (error) {
                console.error('❌ Error processing in-place:', error);
                await chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'showError',
                    message: error.message
                });
            } finally {
                // FIX #2: Clear processing flag after done
                setTimeout(() => {
                    processingTabs.delete(sender.tab.id);
                }, 500);
            }
        } else {
            // Open side panel
            console.log('📱 Opening side panel for action:', message.action);
            if (sender.tab) {
                await chrome.sidePanel.open({ windowId: sender.tab.windowId });
                await new Promise(resolve => setTimeout(resolve, 500));

                console.log('📤 Forwarding to sidepanel...');

                const isChatPage = message.action === 'chat-page';

                chrome.runtime.sendMessage({
                    action: isChatPage ? 'chat' : message.action,
                    text: message.text || message.pageContent || '',
                    pageContent: message.pageContent || '',
                    pageTitle: message.pageTitle || sender.tab.title,
                    pageUrl: message.pageUrl || sender.tab.url,
                    fromContentScript: true,
                    tabId: sender.tab.id,
                    inPlaceEditing: false,
                    senderId: sender.tab.id,
                    isChatPage: isChatPage
                });
                console.log('✅ Forwarded to sidepanel');
            }
        }
    }

    return true;
});