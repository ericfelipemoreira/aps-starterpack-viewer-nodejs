const express = require('express');
const formidable = require('express-formidable');
const fs = require('fs');
const path = require('path');
const { listObjects, uploadObject, translateObject, getManifest, urnify } = require('../services/aps.js');

let router = express.Router();

router.get('/api/models', async function (req, res, next) {
    try {
        const objects = await listObjects();
        res.json(objects.map(o => ({
            name: o.objectKey,
            urn: urnify(o.objectId)
        })));
    } catch (err) {
        next(err);
    }
});

router.get('/api/models/:urn/status', async function (req, res, next) {
    try {
        const manifest = await getManifest(req.params.urn);
        if (manifest) {
            let messages = [];
            if (manifest.derivatives) {
                for (const derivative of manifest.derivatives) {
                    messages = messages.concat(derivative.messages || []);
                    if (derivative.children) {
                        for (const child of derivative.children) {
                            messages.concat(child.messages || []);
                        }
                    }
                }
            }
            res.json({ status: manifest.status, progress: manifest.progress, messages });
        } else {
            res.json({ status: 'n/a' });
        }
    } catch (err) {
        next(err);
    }
});

// Helper function to ensure temp directory exists
function ensureTempDir() {
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
}

// Handle chunk uploads
router.post('/api/models/chunks', formidable({ maxFileSize: Infinity }), async function (req, res, next) {
    try {
        const chunk = req.files['chunk'];
        const chunkNumber = parseInt(req.fields['chunkNumber']);
        const totalChunks = parseInt(req.fields['totalChunks']);
        const fileId = req.fields['fileId'];
        const fileName = req.fields['fileName'];

        if (!chunk || !fileId || isNaN(chunkNumber) || isNaN(totalChunks)) {
            return res.status(400).send('Missing required fields');
        }

        const tempDir = ensureTempDir();
        const chunkDir = path.join(tempDir, fileId);
        
        if (!fs.existsSync(chunkDir)) {
            fs.mkdirSync(chunkDir, { recursive: true });
        }

        // Save the chunk
        const chunkPath = path.join(chunkDir, `chunk.${chunkNumber}`);
        fs.renameSync(chunk.path, chunkPath);

        res.json({ success: true, chunkNumber });
    } catch (err) {
        next(err);
    }
});

// Handle upload completion and file processing
router.post('/api/models/complete', formidable({ maxFileSize: Infinity }), async function (req, res, next) {
    try {
        const fileId = req.fields['fileId'];
        const fileName = req.fields['fileName'];
        const totalChunks = parseInt(req.fields['totalChunks']);
        
        if (!fileId || !fileName || isNaN(totalChunks)) {
            return res.status(400).send('Missing required fields');
        }

        const tempDir = ensureTempDir();
        const chunkDir = path.join(tempDir, fileId);
        const finalFilePath = path.join(tempDir, fileName);

        // Combine chunks
        const writeStream = fs.createWriteStream(finalFilePath);
        for (let i = 0; i < totalChunks; i++) {
            const chunkPath = path.join(chunkDir, `chunk.${i}`);
            if (!fs.existsSync(chunkPath)) {
                return res.status(400).send(`Chunk ${i} is missing`);
            }
            await new Promise((resolve, reject) => {
                const readStream = fs.createReadStream(chunkPath);
                readStream.pipe(writeStream, { end: false });
                readStream.on('end', resolve);
                readStream.on('error', reject);
            });
        }
        writeStream.end();

        // Upload to APS
        const obj = await uploadObject(fileName, finalFilePath);
        await translateObject(urnify(obj.objectId), req.fields['model-zip-entrypoint']);

        // Cleanup
        fs.rmSync(chunkDir, { recursive: true, force: true });
        fs.unlinkSync(finalFilePath);

        res.json({
            name: obj.objectKey,
            urn: urnify(obj.objectId)
        });
    } catch (err) {
        next(err);
    }
});

// Modify existing upload endpoint to handle direct uploads for smaller files
router.post('/api/models', formidable({ maxFileSize: Infinity }), async function (req, res, next) {
    const file = req.files['model-file'];
    if (!file) {
        res.status(400).send('The required field ("model-file") is missing.');
        return;
    }
    try {
        const obj = await uploadObject(file.name, file.path);
        await translateObject(urnify(obj.objectId), req.fields['model-zip-entrypoint']);
        res.json({
            name: obj.objectKey,
            urn: urnify(obj.objectId)
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
