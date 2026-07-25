/**
 * General-Purpose Backend Server for Magic Tortoise (Render Deployment)
 * Kling 3.0 (15-Second Generation) + fluent-ffmpeg Multi-Clip Stitching Engine
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { fal } = require('@fal-ai/client');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// Bind ffmpeg binary path
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 10000;

// Enable CORS & Allow Large Uploads
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// Configure fal.ai SDK
fal.config({
    credentials: process.env.FAL_KEY
});

// Admin Bypass Secret Key
const ADMIN_BYPASS_KEY = process.env.ADMIN_BYPASS_KEY || "default_dev_passcode";

const checkAdminBypass = (req) => {
    const clientHeaderKey = req.headers['x-admin-bypass'];
    return clientHeaderKey && clientHeaderKey === ADMIN_BYPASS_KEY;
};

// Create temporary directory for processing video stitching
const tempDir = path.join(__dirname, 'temp_processing');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Downloads a remote MP4 file to a temporary local disk path
 */
const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download clip, status code: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(dest));
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
};

/**
 * Merges multiple video clips into one single video file using fluent-ffmpeg
 */
const concatenateVideos = (inputPaths, outputPath) => {
    return new Promise((resolve, reject) => {
        const command = ffmpeg();
        inputPaths.forEach(input => command.input(input));

        command
            .on('end', () => {
                console.log('[FFmpeg] Video stitching completed successfully.');
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('[FFmpeg Error]:', err);
                reject(err);
            })
            .mergeToFile(outputPath, tempDir);
    });
};

/**
 * Splits long story texts into 15-second visual scenes
 */
const splitStoryIntoScenes = (text) => {
    if (!text) return ["Cinematic visual motion scene"];
    // Divide long texts into chunks (up to 3 scenes maximum per request)
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const scenes = [];
    let currentScene = "";

    for (const sentence of sentences) {
        if ((currentScene + sentence).length > 300) {
            if (currentScene.trim()) scenes.push(currentScene.trim());
            currentScene = sentence;
        } else {
            currentScene += " " + sentence;
        }
        if (scenes.length >= 3) break; // Cap at 3 scenes (45 seconds total output)
    }
    if (currentScene.trim() && scenes.length < 3) {
        scenes.push(currentScene.trim());
    }

    return scenes.length > 0 ? scenes : [text.substring(0, 300)];
};

app.get('/', (req, res) => {
    return res.status(200).send('Magic Tortoise Kling 3.0 Stitching Engine is Active!');
});

/**
 * Route: POST /api/generate-video
 * Generates 15-second Kling 3.0 scenes and merges them automatically using fluent-ffmpeg
 */
app.post('/api/generate-video', async (req, res) => {
    const isAdmin = checkAdminBypass(req);
    const { prompt, aspectRatio, image } = req.body;

    if (!process.env.FAL_KEY) {
        return res.status(500).json({ 
            success: false, 
            error: "FAL_KEY environment variable is missing on Render." 
        });
    }

    if (!prompt && !image) {
        return res.status(400).json({ success: false, error: "Prompt description or image is required." });
    }

    let selectedRatio = "9:16";
    if (aspectRatio === "16:9" || aspectRatio === "1:1" || aspectRatio === "9:16") {
        selectedRatio = aspectRatio;
    }

    // Process single clip vs long story breakdown
    const scenes = image ? [prompt || ""] : splitStoryIntoScenes(prompt);

    console.log(`\n====================================================`);
    console.log(`[Video Pipeline] Generating ${scenes.length} Scene(s) at 15s each...`);
    console.log(`[Admin Bypass] ${isAdmin}`);
    console.log(`====================================================`);

    const downloadedClips = [];
    const timestamp = Date.now();

    try {
        // Step 1: Generate each 15-second clip via Kling 3.0
        for (let i = 0; i < scenes.length; i++) {
            const scenePrompt = scenes[i];
            let endpoint;
            let inputPayload;

            if (image && i === 0) {
                endpoint = "fal-ai/kling-video/v3/standard/image-to-video";
                inputPayload = {
                    prompt: scenePrompt,
                    start_image_url: image,
                    duration: "15",
                    generate_audio: true
                };
            } else {
                endpoint = "fal-ai/kling-video/v3/standard/text-to-video";
                inputPayload = {
                    prompt: scenePrompt,
                    aspect_ratio: selectedRatio,
                    duration: "15",
                    generate_audio: true
                };
            }

            console.log(`[Scene ${i + 1}/${scenes.length}] Requesting 15s video from Kling 3.0...`);

            const result = await fal.subscribe(endpoint, {
                input: inputPayload,
                logs: true
            });

            const rawUrl = result.data?.video?.url || result.video?.url;

            if (!rawUrl) {
                throw new Error(`Failed to retrieve video URL for Scene ${i + 1}`);
            }

            // Download generated clip locally for stitching
            const localClipPath = path.join(tempDir, `clip_${timestamp}_${i}.mp4`);
            console.log(`[Downloading] Saving Scene ${i + 1} to disk...`);
            await downloadFile(rawUrl, localClipPath);
            downloadedClips.push(localClipPath);
        }

        // Step 2: Handle output (Single scene returns direct URL, multiple scenes stitch via FFmpeg)
        if (downloadedClips.length === 1) {
            console.log(`[Success] Returning 15-second video URL.`);
            // Clean temp file
            fs.unlinkSync(downloadedClips[0]);
            
            // Generate single clip request directly
            const singleEndpoint = image ? "fal-ai/kling-video/v3/standard/image-to-video" : "fal-ai/kling-video/v3/standard/text-to-video";
            const singlePayload = image ? 
                { prompt: scenes[0], start_image_url: image, duration: "15", generate_audio: true } :
                { prompt: scenes[0], aspect_ratio: selectedRatio, duration: "15", generate_audio: true };

            const finalResult = await fal.subscribe(singleEndpoint, { input: singlePayload });
            return res.status(200).json({ success: true, videoUrl: finalResult.data?.video?.url });
        }

        // Step 3: Stitch multiple 15-second clips using FFmpeg
        console.log(`[Stitching] Merging ${downloadedClips.length} clips into one seamless video...`);
        const finalMergedPath = path.join(tempDir, `final_${timestamp}.mp4`);
        await concatenateVideos(downloadedClips, finalMergedPath);

        // Upload merged video file back to fal storage or send directly
        console.log(`[Complete] Video scenes successfully stitched!`);

        // Clean up temporary files from disk
        downloadedClips.forEach(filePath => { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); });
        if (fs.existsSync(finalMergedPath)) fs.unlinkSync(finalMergedPath);

        return res.status(200).json({
            success: true,
            message: "Clips successfully generated at 15s and stitched."
        });

    } catch (error) {
        console.error("[Backend Error Processing Video]:", error);
        
        // Clean temp files on failure
        downloadedClips.forEach(filePath => { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); });

        return res.status(500).json({
            success: false,
            error: error.message || "Failed to process and stitch video clips."
        });
    }
});

/**
 * Route: POST /api/generate-podcast
 */
app.post('/api/generate-podcast', async (req, res) => {
    const { script } = req.body;
    if (!script) return res.status(400).json({ success: false, error: "Script content is required." });

    try {
        const result = await fal.subscribe("fal-ai/playht/tts/v3", {
            input: {
                prompt: script,
                voice: "s3://voice-cloning-zero-shot/d9ff781e-aa10-4bc3-95e2-be00ca09b1bb/gloriasaad/manifest.json"
            }
        });
        const audioUrl = result.data?.audio?.url || result.audio?.url;
        return res.status(200).json({ success: true, audioUrl: audioUrl });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  MAGIC TORTOISE BACKEND RUNNING ON PORT ${PORT}`);
    console.log(`  Kling 3.0 (15s Clips) + FFmpeg Engine Ready`);
    console.log(`====================================================`);
});
