/// import * as Autodesk from "@types/forge-viewer";

async function getAccessToken(callback) {
    try {
        const resp = await fetch('/api/auth/token');
        if (!resp.ok) {
            throw new Error(await resp.text());
        }
        const { access_token, expires_in } = await resp.json();
        callback(access_token, expires_in);
    } catch (err) {
        alert('Could not obtain access token. See the console for more details.');
        console.error(err);
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'loading-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    return notification;
}

function removeNotification(notification) {
    if (notification && notification.parentNode) {
        notification.parentNode.removeChild(notification);
    }
}

export function initViewer(container) {
    return new Promise(function (resolve, reject) {
        const loadingNotification = showNotification('Initializing viewer...');
        
        Autodesk.Viewing.Initializer({ env: 'AutodeskProduction', getAccessToken }, function () {
            const config = {
                extensions: ['Autodesk.DocumentBrowser']
            };
            const viewer = new Autodesk.Viewing.GuiViewer3D(container, config);
            viewer.start();
            viewer.setTheme('light-theme');
            removeNotification(loadingNotification);
            resolve(viewer);
        });
    });
}

export function loadModel(viewer, urn) {
    return new Promise(function (resolve, reject) {
        const loadingNotification = showNotification('Please wait, do not interact');
        
        function onDocumentLoadSuccess(doc) {
            const viewerPromise = viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
            viewerPromise.then(() => {
                removeNotification(loadingNotification);
            });
            resolve(viewerPromise);
        }
        
        function onDocumentLoadFailure(code, message, errors) {
            removeNotification(loadingNotification);
            reject({ code, message, errors });
        }
        
        viewer.setLightPreset(0);
        Autodesk.Viewing.Document.load('urn:' + urn, onDocumentLoadSuccess, onDocumentLoadFailure);
    });
}
