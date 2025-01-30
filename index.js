import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'fs/promises';
import youtubeDl from 'youtube-dl-exec';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  ['http://localhost:5173', 'http://localhost:4173'];

// Create downloads directory if it doesn't exist
const downloadsDir = join(__dirname, '../downloads');
await mkdir(downloadsDir, { recursive: true });

// Configure CORS with specific origins
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use('/downloads', express.static(downloadsDir));

// Clean up old downloads (files older than 1 hour)
const cleanupDownloads = () => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const fs = require('fs');
  
  fs.readdir(downloadsDir, (err, files) => {
    if (err) return console.error('Cleanup error:', err);
    
    files.forEach(file => {
      const filePath = join(downloadsDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return console.error('File stat error:', err);
        
        if (stats.mtimeMs < oneHourAgo) {
          fs.unlink(filePath, err => {
            if (err) console.error('File deletion error:', err);
          });
        }
      });
    });
  });
};

// Run cleanup every hour
setInterval(cleanupDownloads, 60 * 60 * 1000);

app.post('/api/download', async (req, res) => {
  try {
    const { url, quality } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate YouTube URL
    const youtubeUrlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!youtubeUrlPattern.test(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Set quality options based on user selection
    const formatOption = quality === '1080p' ? 'bestvideo[height<=1080]+bestaudio/best' :
                        quality === '720p' ? 'bestvideo[height<=720]+bestaudio/best' :
                        quality === '480p' ? 'bestvideo[height<=480]+bestaudio/best' :
                        'bestvideo[height<=360]+bestaudio/best';

    // Get video info first
    const videoInfo = await youtubeDl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true
    });

    const filename = `${videoInfo.title}-${quality}.mp4`;
    const outputPath = join(downloadsDir, filename);

    // Start download
    await youtubeDl(url, {
      output: outputPath,
      format: formatOption,
      mergeOutputFormat: 'mp4',
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true
    });

    // Return download URL
    const downloadUrl = `/downloads/${filename}`;
    res.json({ 
      success: true, 
      message: 'Download completed',
      downloadUrl,
      videoInfo: {
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        duration: videoInfo.duration,
        uploader: videoInfo.uploader
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      error: 'Download failed', 
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});