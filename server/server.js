const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const RAW_DIR = path.resolve(__dirname, '..', 'raw materials');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'test-case');
const METADATA_DIR = path.resolve(OUTPUT_DIR, '.metadata');

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(METADATA_DIR)) {
  fs.mkdirSync(METADATA_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// List all raw images and their status
app.get('/api/images', (req, res) => {
  try {
    if (!fs.existsSync(RAW_DIR)) {
      return res.json({ success: true, images: [] });
    }

    const files = fs.readdirSync(RAW_DIR);
    const imageExtensions = ['.webp', '.jpg', '.jpeg', '.png', '.bmp'];
    
    // Sort files naturally (02.webp, 03.webp ... 68.webp)
    const filteredFiles = files
      .filter(f => imageExtensions.includes(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const images = filteredFiles.map(filename => {
      const outputPath = path.join(OUTPUT_DIR, filename);
      const metadataPath = path.join(METADATA_DIR, `${filename}.json`);
      const hasOutput = fs.existsSync(outputPath);
      const hasMetadata = fs.existsSync(metadataPath);

      let metadata = null;
      if (hasMetadata) {
        try {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        } catch (e) {
          console.error(`Error reading metadata for ${filename}:`, e);
        }
      }

      return {
        filename,
        rawUrl: `/api/raw/${encodeURIComponent(filename)}`,
        outputUrl: hasOutput ? `/api/output/${encodeURIComponent(filename)}?t=${Date.now()}` : null,
        status: hasOutput ? 'done' : (hasMetadata ? 'in_progress' : 'raw'),
        metadata
      };
    });

    res.json({ success: true, images, rawDir: RAW_DIR, outputDir: OUTPUT_DIR });
  } catch (err) {
    console.error('Error listing images:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve raw image
app.get('/api/raw/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(RAW_DIR, filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Serve output image
app.get('/api/output/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Output file not found' });
  }
});

// Save final rendered image to test-case
app.post('/api/save-output', (req, res) => {
  try {
    const { filename, imageBase64 } = req.body;
    if (!filename || !imageBase64) {
      return res.status(400).json({ success: false, error: 'Missing filename or imageBase64' });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const outputPath = path.join(OUTPUT_DIR, filename);

    fs.writeFileSync(outputPath, buffer);
    res.json({ success: true, message: `Saved to ${outputPath}`, filename });
  } catch (err) {
    console.error('Error saving output image:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save project metadata (bubbles, translations, styling, inpainting state)
app.post('/api/save-project', (req, res) => {
  try {
    const { filename, metadata } = req.body;
    if (!filename || !metadata) {
      return res.status(400).json({ success: false, error: 'Missing filename or metadata' });
    }

    const metadataPath = path.join(METADATA_DIR, `${filename}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    res.json({ success: true, message: `Project metadata saved for ${filename}` });
  } catch (err) {
    console.error('Error saving project metadata:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get project metadata
app.get('/api/project/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const metadataPath = path.join(METADATA_DIR, `${filename}.json`);
    if (fs.existsSync(metadataPath)) {
      const data = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      res.json({ success: true, metadata: data });
    } else {
      res.json({ success: true, metadata: null });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Manga Translator Studio Local Bridge running at http://localhost:${PORT}`);
  console.log(`📁 Raw Directory: ${RAW_DIR}`);
  console.log(`📁 Output Directory: ${OUTPUT_DIR}`);
});
