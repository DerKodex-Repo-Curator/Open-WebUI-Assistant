// Load saved settings
function loadSettings() {
  chrome.storage.sync.get(['baseUrl', 'username', 'password', 'inPlaceEditing', 'saveLogin', 'selectedModel'], (data) => {
    if (data.baseUrl) document.getElementById('baseUrl').value = data.baseUrl;
    if (data.username) document.getElementById('username').value = data.username;
    if (data.password) document.getElementById('password').value = data.password;
    document.getElementById('inPlaceEditing').checked = data.inPlaceEditing !== false; // Default true
    document.getElementById('saveLogin').checked = data.saveLogin !== false; // Default true
    
    // If we have credentials, try to load models automatically
    if (data.baseUrl && data.username && data.password) {
      loadModelsIntoDropdown(data.baseUrl, data.username, data.password, data.selectedModel);
    }
  });
}

// Show status message
function showStatus(elementId, message, isError = false) {
  const status = document.getElementById(elementId);
  status.textContent = message;
  status.className = `status ${isError ? 'error' : 'success'}`;
  status.style.display = 'block';

  setTimeout(() => {
    status.style.display = 'none';
  }, 4000);
}

// Save settings
document.getElementById('saveBtn').addEventListener('click', () => {
  const baseUrl = document.getElementById('baseUrl').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const inPlaceEditing = document.getElementById('inPlaceEditing').checked;
  const saveLogin = document.getElementById('saveLogin').checked;
  const defaultModel = document.getElementById('defaultModel').value;

  if (!baseUrl) {
    showStatus('status', 'Please enter a base URL', true);
    return;
  }

  // If saveLogin is unchecked, require username/password to be empty or both filled
  if (!saveLogin && username && password) {
    showStatus('status', 'To disable saved login, clear the username and password fields', true);
    return;
  }

  if (saveLogin && (!username || !password)) {
    showStatus('status', 'Please fill in username and password to save login', true);
    return;
  }

  // Remove trailing slash from URL
  const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const settingsToSave = {
    baseUrl: cleanUrl,
    inPlaceEditing: inPlaceEditing,
    saveLogin: saveLogin,
    authToken: null // Clear old token
  };

  // Save default model if selected
  if (defaultModel) {
    settingsToSave.selectedModel = defaultModel;
    settingsToSave.defaultModel = defaultModel; // Also save as defaultModel for sidepanel
  }

  // Only save credentials if saveLogin is checked
  if (saveLogin) {
    settingsToSave.username = username;
    settingsToSave.password = password;
  } else {
    // Clear saved credentials
    settingsToSave.username = '';
    settingsToSave.password = '';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
  }

  chrome.storage.sync.set(settingsToSave, () => {
    if (saveLogin) {
      showStatus('status', 'Settings and login credentials saved successfully!');
    } else {
      showStatus('status', 'Settings saved! Login credentials cleared.');
    }
  });
});

// Test connection
document.getElementById('testBtn').addEventListener('click', async () => {
  const baseUrl = document.getElementById('baseUrl').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!baseUrl || !username || !password) {
    showStatus('testStatus', 'Please fill in all fields first', true);
    return;
  }

  const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  try {
    showStatus('testStatus', 'Testing connection...');

    // Test authentication
    const response = await fetch(`${cleanUrl}/api/v1/auths/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: username,
        password: password
      })
    });

    if (!response.ok) {
      throw new Error('Authentication failed. Please check your credentials.');
    }

    const data = await response.json();

    // Test fetching models
    const modelsResponse = await fetch(`${cleanUrl}/api/models`, {
      headers: {
        'Authorization': `Bearer ${data.token}`
      }
    });

    if (!modelsResponse.ok) {
      throw new Error('Connected but failed to fetch models.');
    }

    const modelsData = await modelsResponse.json();
    const models = modelsData.data || modelsData.models || [];

    showStatus('testStatus', `Success! Connected and found ${models.length} model(s).`);
    
    // Load models into dropdown
    await loadModelsIntoDropdown(cleanUrl, username, password);
    
  } catch (error) {
    console.error('Connection test error:', error);
    showStatus('testStatus', `Connection failed: ${error.message}`, true);
  }
});

// Load models into the dropdown
async function loadModelsIntoDropdown(baseUrl, username, password, selectedModelId = null) {
  const modelSelect = document.getElementById('defaultModel');
  const modelGroup = document.getElementById('modelSelectionGroup');
  
  try {
    const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    
    // Authenticate
    const authResponse = await fetch(`${cleanUrl}/api/v1/auths/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: username, password: password })
    });
    
    if (!authResponse.ok) {
      throw new Error('Authentication failed');
    }
    
    const authData = await authResponse.json();
    
    // Fetch models
    const modelsResponse = await fetch(`${cleanUrl}/api/models`, {
      headers: { 'Authorization': `Bearer ${authData.token}` }
    });
    
    if (!modelsResponse.ok) {
      throw new Error('Failed to fetch models');
    }
    
    const modelsData = await modelsResponse.json();
    const models = modelsData.data || modelsData.models || [];
    
    // Filter out hidden models (models where info.meta.hidden is true)
    const visibleModels = models.filter(model => {
      // Check if model has meta.hidden property
      if (model.info && model.info.meta && model.info.meta.hidden === true) {
        return false; // Skip hidden models
      }
      return true; // Include visible models
    });
    
    // Populate dropdown
    modelSelect.innerHTML = '';
    
    if (visibleModels.length === 0) {
      modelSelect.innerHTML = '<option value="">No models available</option>';
      modelSelect.disabled = true;
    } else {
      // Add placeholder option
      const placeholderOption = document.createElement('option');
      placeholderOption.value = '';
      placeholderOption.textContent = 'Select a default model...';
      modelSelect.appendChild(placeholderOption);
      
      // Add model options
      visibleModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id || model.name;
        option.textContent = model.name || model.id;
        
        // Select previously saved model or the first model
        if (selectedModelId && selectedModelId === (model.id || model.name)) {
          option.selected = true;
        }
        
        modelSelect.appendChild(option);
      });
      
      // If no model was previously selected, select the first one
      if (!selectedModelId && visibleModels.length > 0) {
        modelSelect.selectedIndex = 1; // Select first model (not placeholder)
      }
      
      modelSelect.disabled = false;
    }
    
    // Show the model selection group
    modelGroup.style.display = 'block';
    
  } catch (error) {
    console.error('Error loading models:', error);
    modelSelect.innerHTML = '<option value="">Error loading models</option>';
    modelSelect.disabled = true;
    modelGroup.style.display = 'block';
  }
}

// Load settings on page load
loadSettings();
