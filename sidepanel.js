let currentContext = null;
let chatHistory = [];
let isProcessing = false;
let currentOutputText = '';
let currentOutputHTML = '';
let isSpeaking = false;

// Simple markdown to HTML converter
function markdownToHTML(text) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^\*\*\*$/gm, '<hr>');

  html = html.split('\n\n').map(para => {
    if (para.match(/^<(h[1-6]|ul|ol|pre|blockquote|hr)/)) {
      return para;
    }
    return `<p>${para.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return html;
}

// Strip markdown for plain text
function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\* /gm, '')
    .replace(/^- /gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/---/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Copy to clipboard
async function copyToClipboard(text, isHTML = false) {
  try {
    if (isHTML) {
      const blob = new Blob([text], { type: 'text/html' });
      const clipboardItem = new ClipboardItem({ 'text/html': blob });
      await navigator.clipboard.write([clipboardItem]);
      showStatus('HTML copied to clipboard!', 'success');
    } else {
      await navigator.clipboard.writeText(text);
      showStatus('Text copied to clipboard!', 'success');
    }
  } catch (error) {
    console.error('Copy error:', error);
    try {
      await navigator.clipboard.writeText(text);
      showStatus('Copied to clipboard!', 'success');
    } catch (e) {
      showStatus('Failed to copy', 'error');
    }
  }
}

// Text-to-Speech
async function speakText(text, messageId = null) {
  try {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
      updateTTSButton(false, messageId);
      return;
    }

    const cleanText = stripMarkdown(text);
    
    if (!cleanText || cleanText.length < 3) {
      showStatus('No text to speak', 'error');
      return;
    }

    if (!('speechSynthesis' in window)) {
      showStatus('Text-to-speech not supported in this browser', 'error');
      return;
    }

    showStatus('Starting speech...', 'info');
    updateTTSButton(true, messageId);
    isSpeaking = true;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onend = () => {
      isSpeaking = false;
      updateTTSButton(false, messageId);
      showStatus('Speech finished', 'success');
    };

    utterance.onerror = (event) => {
      isSpeaking = false;
      updateTTSButton(false, messageId);
      showStatus(`Speech error: ${event.error}`, 'error');
    };

    window.speechSynthesis.speak(utterance);

  } catch (error) {
    console.error('TTS error:', error);
    showStatus(`TTS Error: ${error.message}`, 'error');
    isSpeaking = false;
    updateTTSButton(false, messageId);
  }
}

// Update TTS button appearance
function updateTTSButton(isPlaying, messageId = null) {
  if (messageId) {
    const btn = document.querySelector(`[data-message-id="${messageId}"]`);
    if (btn) {
      btn.textContent = isPlaying ? '⏸️' : '🔊';
      btn.classList.toggle('playing', isPlaying);
    }
  } else {
    const btn = document.getElementById('ttsButton');
    const icon = document.getElementById('ttsIcon');
    const text = document.getElementById('ttsText');
    
    if (isPlaying) {
      icon.textContent = '⏸️';
      text.textContent = 'Stop';
      btn.classList.add('playing');
    } else {
      icon.textContent = '🔊';
      text.textContent = 'Speak';
      btn.classList.remove('playing');
    }
  }
}

// Show status message
function showStatus(message, type = 'info') {
  const statusBar = document.getElementById('statusBar');
  statusBar.className = `status ${type}`;
  statusBar.textContent = message;
  
  if (type === 'success') {
    setTimeout(() => {
      statusBar.className = 'status hidden';
    }, 2000);
  }
}

// Get config from storage
async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['baseUrl', 'username', 'password', 'selectedModel', 'defaultModel', 'authToken'], (data) => {
      resolve(data);
    });
  });
}

// Save selected model
async function saveSelectedModel(modelId) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ selectedModel: modelId, defaultModel: modelId }, resolve);
  });
}

// Authenticate with Open WebUI
async function authenticate(baseUrl, username, password) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/auths/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: username, password: password })
    });

    if (!response.ok) {
      throw new Error('Authentication failed');
    }

    const data = await response.json();
    
    await new Promise((resolve) => {
      chrome.storage.sync.set({ authToken: data.token }, resolve);
    });

    return data.token;
  } catch (error) {
    console.error('Auth error:', error);
    throw error;
  }
}

// Get auth token
async function getAuthToken() {
  const config = await getConfig();
  
  if (!config.baseUrl || !config.username || !config.password) {
    throw new Error('Please configure the extension in settings');
  }

  if (config.authToken) {
    return config.authToken;
  }

  return await authenticate(config.baseUrl, config.username, config.password);
}

// Fetch models
async function fetchModels() {
  try {
    const config = await getConfig();
    const token = await getAuthToken();

    const response = await fetch(`${config.baseUrl}/api/models`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        const newToken = await authenticate(config.baseUrl, config.username, config.password);
        return await fetchModels();
      }
      throw new Error('Failed to fetch models');
    }

    const data = await response.json();
    return data.data || data.models || [];
  } catch (error) {
    console.error('Error fetching models:', error);
    throw error;
  }
}

// Load models into dropdown
async function loadModels() {
  const modelSelect = document.getElementById('modelSelect');
  
  try {
    const config = await getConfig();
    const savedModel = config.defaultModel || config.selectedModel;
    
    if (savedModel) {
      modelSelect.innerHTML = '';
      const tempOption = document.createElement('option');
      tempOption.value = savedModel;
      tempOption.textContent = savedModel;
      tempOption.selected = true;
      modelSelect.appendChild(tempOption);
    }
    
    const models = await fetchModels();

    modelSelect.innerHTML = '';

    const visibleModels = models.filter(model => {
      if (model.info && model.info.meta && model.info.meta.hidden === true) {
        return false;
      }
      return true;
    });

    if (visibleModels.length === 0) {
      modelSelect.innerHTML = '<option value="">No models available</option>';
      showStatus('No models found', 'error');
      return;
    }

    visibleModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id || model.name;
      option.textContent = model.name || model.id;
      
      if (savedModel === (model.id || model.name)) {
        option.selected = true;
      }
      
      modelSelect.appendChild(option);
    });

    if (!savedModel && visibleModels.length > 0) {
      modelSelect.selectedIndex = 0;
      await saveSelectedModel(visibleModels[0].id || visibleModels[0].name);
    }

  } catch (error) {
    modelSelect.innerHTML = '<option value="">Error loading models</option>';
    showStatus(`Error: ${error.message}`, 'error');
  }
}

// Send chat message - WITH FULL CONTEXT (page + output)
async function sendChatMessage(message, includeContext = true) {
  try {
    const config = await getConfig();
    const token = await getAuthToken();
    const modelId = document.getElementById('modelSelect').value;

    if (!modelId) {
      throw new Error('Please select a model');
    }

    const messages = [];
    
    // Build context message with page content AND current output
    if (includeContext && currentContext) {
      let contextMessage = '';
      
      // Include page information if available
      if (currentContext.pageTitle || currentContext.pageContent) {
        contextMessage += 'Context from webpage:\n';
        if (currentContext.pageTitle) {
          contextMessage += `Title: ${currentContext.pageTitle}\n`;
        }
        if (currentContext.pageUrl) {
          contextMessage += `URL: ${currentContext.pageUrl}\n`;
        }
        if (currentContext.pageContent) {
          contextMessage += `\nPage Content:\n${currentContext.pageContent.substring(0, 4000)}\n`;
        }
      }
      
      // Include selected text if available
      if (currentContext.selectedText) {
        contextMessage += `\nSelected Text:\n${currentContext.selectedText}\n`;
      }
      
      // Include current output (what's showing in the output box)
      if (currentOutputText) {
        contextMessage += `\nPrevious AI Output:\n${currentOutputText}\n`;
      }
      
      if (contextMessage) {
        messages.push({
          role: 'system',
          content: contextMessage
        });
      }
    }

    // Add chat history
    chatHistory.forEach(msg => {
      messages.push(msg);
    });

    // Add new message
    messages.push({
      role: 'user',
      content: message
    });

    const response = await fetch(`${config.baseUrl}/api/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: messages,
        stream: false
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        const newToken = await authenticate(config.baseUrl, config.username, config.password);
        return await sendChatMessage(message, includeContext);
      }
      throw new Error('Failed to send message');
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;

    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: assistantMessage });

    return assistantMessage;
  } catch (error) {
    console.error('Chat error:', error);
    throw error;
  }
}

// Display chat message
function displayChatMessage(role, content) {
  const chatHistoryDiv = document.getElementById('chatHistory');
  const messageDiv = document.createElement('div');
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  messageDiv.className = `chat-message ${role}`;
  messageDiv.dataset.messageId = messageId;
  
  const formattedContent = markdownToHTML(content);
  
  let buttonsHtml = '';
  if (role === 'assistant') {
    buttonsHtml = `
      <div class="chat-buttons">
        <button class="chat-btn chat-copy-btn" data-message-id="${messageId}" data-content="${encodeURIComponent(content)}" title="Copy">📋</button>
        <button class="chat-btn chat-tts-btn" data-message-id="${messageId}" title="Read aloud">🔊</button>
      </div>
    `;
  }
  
  messageDiv.innerHTML = `<strong>${role === 'user' ? 'You' : 'AI'}</strong>${buttonsHtml}<div class="message-content">${formattedContent}</div>`;
  
  if (role === 'assistant') {
    const ttsBtn = messageDiv.querySelector('.chat-tts-btn');
    const copyBtn = messageDiv.querySelector('.chat-copy-btn');
    
    ttsBtn.addEventListener('click', () => {
      speakText(content, messageId);
    });
    
    copyBtn.addEventListener('click', () => {
      const plainText = stripMarkdown(content);
      copyToClipboard(plainText, false);
    });
  }
  
  chatHistoryDiv.appendChild(messageDiv);
  chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
}

// Process action - FOR DISPLAY IN OUTPUT BOX ONLY
async function processAction(action, text, context = null) {
  if (isProcessing) {
    console.log('Already processing, ignoring duplicate request');
    return;
  }

  console.log('=== processAction in sidepanel ===');
  console.log('Action:', action);
  console.log('Text length:', text?.length || 0);
  console.log('Context:', context);

  // Store context for chat (includes page content, selected text, etc.)
  currentContext = {
    pageContent: context?.pageContent || '',
    pageTitle: context?.pageTitle || '',
    pageUrl: context?.pageUrl || '',
    selectedText: text || '',
    isChatPage: context?.isChatPage || false
  };

  // For chat actions, just set up the output box message
  if (action === 'chat' || context?.isChatPage) {
    const output = document.getElementById('output');
    output.className = 'empty';
    
    if (context?.isChatPage) {
      output.textContent = '💬 Ready to chat about this page! Ask your questions below.';
    } else if (text) {
      output.textContent = '💬 Chat is ready! Your selected text and page context are available.';
    } else {
      output.textContent = 'Chat is ready below. Ask anything!';
    }
    
    document.getElementById('ttsButton').classList.add('hidden');
    document.getElementById('copyFormatted').classList.add('hidden');
    document.getElementById('copyPlain').classList.add('hidden');
    document.getElementById('chatInput').focus();
    return;
  }

  // For other actions (summarize, check-grammar, explain-page)
  isProcessing = true;
  
  try {
    showStatus('Thinking...', 'info');
    const output = document.getElementById('output');
    output.className = '';
    output.innerHTML = '<div style="color: #666; font-style: italic;">Thinking...</div>';
    document.getElementById('ttsButton').classList.add('hidden');
    document.getElementById('copyFormatted').classList.add('hidden');
    document.getElementById('copyPlain').classList.add('hidden');

    // Build prompt
    let prompt = '';
    switch (action) {
      case 'summarize':
        prompt = `Please provide a concise summary of the following text:\n\n${text}`;
        break;
      case 'check-grammar':
        prompt = `Please carefully review the following text for spelling and grammar errors. List any errors you find with explanations and suggestions:\n\n${text}`;
        break;
      case 'explain-page':
        prompt = `Please explain what this webpage is about:\n\nTitle: ${context.pageTitle}\n\nContent:\n${context.pageContent.substring(0, 4000)}`;
        break;
      default:
        prompt = `Process this text for ${action}:\n\n${text}`;
    }

    // Call AI (don't pass context here - we're generating OUTPUT, not chatting)
    const response = await sendChatMessage(prompt, false);
    
    currentOutputText = response;
    currentOutputHTML = markdownToHTML(response);

    output.innerHTML = currentOutputHTML;
    document.getElementById('ttsButton').classList.remove('hidden');
    document.getElementById('copyFormatted').classList.remove('hidden');
    document.getElementById('copyPlain').classList.remove('hidden');
    showStatus('Complete! You can now chat about this result below.', 'success');

  } catch (error) {
    const output = document.getElementById('output');
    output.innerHTML = `<div style="color: #c00;">Error: ${error.message}</div><div style="margin-top: 10px; font-size: 12px; color: #666;">Please check your settings and try again.</div>`;
    showStatus(`Error: ${error.message}`, 'error');
    document.getElementById('ttsButton').classList.add('hidden');
    document.getElementById('copyFormatted').classList.add('hidden');
    document.getElementById('copyPlain').classList.add('hidden');
    currentOutputText = '';
    currentOutputHTML = '';
  } finally {
    isProcessing = false;
  }
}

// Event listeners
document.getElementById('modelSelect').addEventListener('change', async (e) => {
  await saveSelectedModel(e.target.value);
  showStatus('Model saved', 'success');
});

document.getElementById('refreshModels').addEventListener('click', async () => {
  showStatus('Refreshing...', 'info');
  await loadModels();
  showStatus('Models refreshed', 'success');
});

document.getElementById('ttsButton').addEventListener('click', () => {
  if (currentOutputText) {
    speakText(currentOutputText);
  }
});

document.getElementById('copyFormatted').addEventListener('click', () => {
  if (currentOutputHTML) {
    copyToClipboard(currentOutputHTML, true);
  }
});

document.getElementById('copyPlain').addEventListener('click', () => {
  if (currentOutputText) {
    const plainText = stripMarkdown(currentOutputText);
    copyToClipboard(plainText, false);
  }
});

document.getElementById('sendChat').addEventListener('click', async () => {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message) return;

  input.value = '';
  displayChatMessage('user', message);

  try {
    showStatus('Thinking...', 'info');
    // Pass true to include full context (page + output + selected text)
    const response = await sendChatMessage(message, true);
    displayChatMessage('assistant', response);
    showStatus('Response received', 'success');
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
    displayChatMessage('assistant', `Error: ${error.message}`);
  }
});

document.getElementById('chatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('sendChat').click();
  }
});

document.getElementById('clearChat').addEventListener('click', () => {
  chatHistory = [];
  // DON'T clear currentContext - keep page context available
  // DON'T clear currentOutputText - keep output available for reference
  document.getElementById('chatHistory').innerHTML = '';
  
  if (isSpeaking) {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    updateTTSButton(false);
  }
  
  showStatus('Chat history cleared (context preserved)', 'success');
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('=== Sidepanel received message ===', message);
  
  // Handle displayResult (from in-place actions) - show in OUTPUT box
  if (message.action === 'displayResult') {
    currentOutputText = message.result;
    currentOutputHTML = markdownToHTML(message.result);
    
    // Update context with the result
    if (!currentContext) {
      currentContext = {};
    }
    currentContext.selectedText = message.originalText || '';
    
    const output = document.getElementById('output');
    output.className = '';
    output.innerHTML = currentOutputHTML;
    document.getElementById('ttsButton').classList.remove('hidden');
    document.getElementById('copyFormatted').classList.remove('hidden');
    document.getElementById('copyPlain').classList.remove('hidden');
    showStatus('Complete! You can chat about this result below.', 'success');
    return;
  }
  
  // Handle regular actions
  if (message.action) {
    processAction(message.action, message.text, {
      pageContent: message.pageContent,
      pageTitle: message.pageTitle,
      pageUrl: message.pageUrl,
      fromContentScript: message.fromContentScript || false,
      tabId: message.tabId,
      inPlaceEditing: message.inPlaceEditing || false,
      senderId: message.senderId,
      isChatPage: message.isChatPage || false
    });
  } else if (message.action === 'showError') {
    showStatus(message.message, 'error');
  }
});

// Initialize
(async function() {
  await loadModels();
})();
