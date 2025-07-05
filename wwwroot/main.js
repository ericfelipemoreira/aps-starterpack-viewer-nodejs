import { initViewer, loadModel } from './viewer.js';

initViewer(document.getElementById('preview')).then(viewer => {
    const urn = window.location.hash?.substring(1);
    setupModelSelection(viewer, urn);
    setupModelUpload(viewer);
});

async function setupModelSelection(viewer, selectedUrn) {
    const dropdown = document.getElementById('models');
    dropdown.innerHTML = '';
    try {
        const resp = await fetch('/api/models');
        if (!resp.ok) {
            throw new Error(await resp.text());
        }
        const models = await resp.json();
        dropdown.innerHTML = models.map(model => `<option value=${model.urn} ${model.urn === selectedUrn ? 'selected' : ''}>${model.name}</option>`).join('\n');
        dropdown.onchange = () => onModelSelected(viewer, dropdown.value);
        if (dropdown.value) {
            onModelSelected(viewer, dropdown.value);
        }
    } catch (err) {
        alert('Could not list models. See the console for more details.');
        console.error(err);
    }
}

async function setupModelUpload(viewer) {
    const upload = document.getElementById('upload');
    const input = document.getElementById('input');
    const models = document.getElementById('models');
    upload.onclick = () => input.click();
    input.onchange = async () => {
        const file = input.files[0];
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
        
        upload.setAttribute('disabled', 'true');
        models.setAttribute('disabled', 'true');
        
        try {
            if (file.size > 10 * 1024 * 1024) { // Use chunked upload for files larger than 10MB
                const fileId = Date.now().toString(); // Simple unique ID
                const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
                
                showNotification(`Uploading model <em>${file.name}</em> in chunks. Do not reload the page.`);
                
                // Upload chunks
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(file.size, start + CHUNK_SIZE);
                    const chunk = file.slice(start, end);
                    
                    const formData = new FormData();
                    formData.append('chunk', chunk);
                    formData.append('chunkNumber', i);
                    formData.append('totalChunks', totalChunks);
                    formData.append('fileId', fileId);
                    formData.append('fileName', file.name);
                    
                    showNotification(`Uploading chunk ${i + 1}/${totalChunks} of <em>${file.name}</em>`);
                    
                    const resp = await fetch('/api/models/chunks', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (!resp.ok) throw new Error(await resp.text());
                }
                
                // Complete the upload
                showNotification(`Finalizing upload of <em>${file.name}</em>`);
                const completeFormData = new FormData();
                completeFormData.append('fileId', fileId);
                completeFormData.append('fileName', file.name);
                completeFormData.append('totalChunks', totalChunks);
                
                if (file.name.endsWith('.zip')) {
                    const entrypoint = window.prompt('Please enter the filename of the main design inside the archive.');
                    completeFormData.append('model-zip-entrypoint', entrypoint);
                }
                
                const completeResp = await fetch('/api/models/complete', {
                    method: 'POST',
                    body: completeFormData
                });
                
                if (!completeResp.ok) throw new Error(await completeResp.text());
                const model = await completeResp.json();
                setupModelSelection(viewer, model.urn);
            } else {
                // Use existing direct upload for smaller files
                let data = new FormData();
                data.append('model-file', file);
                if (file.name.endsWith('.zip')) {
                    const entrypoint = window.prompt('Please enter the filename of the main design inside the archive.');
                    data.append('model-zip-entrypoint', entrypoint);
                }
                showNotification(`Uploading model <em>${file.name}</em>. Do not reload the page.`);
                const resp = await fetch('/api/models', { method: 'POST', body: data });
                if (!resp.ok) throw new Error(await resp.text());
                const model = await resp.json();
                setupModelSelection(viewer, model.urn);
            }
        } catch (err) {
            alert(`Could not upload model ${file.name}. See the console for more details.`);
            console.error(err);
        } finally {
            clearNotification();
            upload.removeAttribute('disabled');
            models.removeAttribute('disabled');
            input.value = '';
        }
    };
}

async function onModelSelected(viewer, urn) {
    if (window.onModelSelectedTimeout) {
        clearTimeout(window.onModelSelectedTimeout);
        delete window.onModelSelectedTimeout;
    }
    window.location.hash = urn;
    try {
        const resp = await fetch(`/api/models/${urn}/status`);
        if (!resp.ok) {
            throw new Error(await resp.text());
        }
        const status = await resp.json();
        switch (status.status) {
            case 'n/a':
                showNotification(`Model has not been translated.`);
                break;
            case 'inprogress':
                showNotification(`Model is being translated (${status.progress})...`);
                window.onModelSelectedTimeout = setTimeout(onModelSelected, 5000, viewer, urn);
                break;
            case 'failed':
                showNotification(`Translation failed. <ul>${status.messages.map(msg => `<li>${JSON.stringify(msg)}</li>`).join('')}</ul>`);
                break;
            default:
                clearNotification();
                loadModel(viewer, urn);
                break; 
        }
    } catch (err) {
        alert('Could not load model. See the console for more details.');
        console.error(err);
    }
}

function showNotification(message) {
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `<div class="notification">${message}</div>`;
    overlay.style.display = 'flex';
}

function clearNotification() {
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = '';
    overlay.style.display = 'none';
}
