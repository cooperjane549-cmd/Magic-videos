/**
 * General-Purpose Backend Server for Magic Tortoise (Render Deployment)
 * Powered by Kling 3.0 AI (fal.ai) with Native Audio Generation & MOCK_MODE Safety
 */

const express = require('express');
const cors = require('cors');
const { fal } = require('@fal-ai/client');

const app = express();
const PORT = process.env.PORT || 10000;

// Set MOCK_MODE to true to test your Android app/WebView for $0.00 free.
// Change to false (or set MOCK_MODE=false in Render env variables) when ready for live production.
const MOCK_MODE = process.env.MOCK_MODE ? process.env.MOCK_MODE === 'true' : true;

// Sample public video URL returned during MOCK_MODE testing
const SAMPLE_MOCK_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors({ origin: '*' }));

// Increase JSON limit to allow base64 image uploads
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

/**
 * Sanitizes and extracts the essential visual scene description from raw prompts
 */
const sanitizePrompt = (rawPrompt) => {
    if (!rawPrompt) return "";
    let cleaned = String(rawPrompt).trim();
    if (cleaned.length > 500) {
        cleaned = cleaned.substring(0, 500);
    }
    return cleaned;
};

app.get('/', (req, res) => {
    return res.status(200).send(`Magic Tortoise Engine Active! [Mock Mode: ${MOCK_MODE}]`);
});

/**
 * Route: POST /api/generate-video
 * Handles Kling 3.0 AI Text-to-Video and Image-to-Video with Native Audio Generation
 */
app.post('/api/generate-video', async (req, res) => {
    const isAdmin = checkAdminBypass(req);
    const { prompt, aspectRatio, image } = req.body;

    if (!prompt && !image) {
        return res.status(400).json({ success: false, error: "Please provide a prompt description or an image." });
    }

    const cleanedPrompt = sanitizePrompt(prompt);

    console.log(`\n====================================================`);
    console.log(`[Video Request] Mock Mode: ${MOCK_MODE} | Admin Bypass: ${isAdmin}`);
    console.log(`[Prompt Text] "${cleanedPrompt || 'Image animation'}"`);
    console.log(`====================================================`);

    // FREE MOCK RESPONSE (Zero API charges)
    if (MOCK_MODE) {
        console.log('[MOCK MODE ACTIVE]: Bypassing fal.ai call. Returning sample video URL.');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return res.status(200).json({
            success: true,
            videoUrl: SAMPLE_MOCK_VIDEO_URL
        });
    }

    // LIVE PRODUCTION CALL
    if (!process.env.FAL_KEY) {
        return res.status(500).json({ 
            success: false, 
            error: "FAL_KEY environment variable is missing on Render." 
        });
    }

    let selectedRatio = "9:16";
    if (aspectRatio === "16:9" || aspectRatio === "1:1" || aspectRatio === "9:16") {
        selectedRatio = aspectRatio;
    }

    try {
        let endpoint;
        let inputPayload;

        if (image) {
            // Kling 3.0 Image-to-Video with Audio
            endpoint = "fal-ai/kling-video/v3/standard/image-to-video";
            inputPayload = {
                prompt: cleanedPrompt || "",
                start_image_url: image,
                duration: "5",
                generate_audio: true
            };
        } else {
            // Kling 3.0 Text-to-Video with Audio
            endpoint = "fal-ai/kling-video/v3/standard/text-to-video";
            inputPayload = {
                prompt: cleanedPrompt,
                aspect_ratio: selectedRatio,
                duration: "5",
                generate_audio: true
            };
        }

        console.log(`Submitting request with Native Audio to ${endpoint}...`);

        const result = await fal.subscribe(endpoint, {
            input: inputPayload,
            logs: true
        });

        const videoUrl = result.data?.video?.url || result.video?.url;

        if (videoUrl) {
            console.log(`\nVideo generated successfully with sound!`);
            console.log(`Video URL: ${videoUrl}`);
            return res.status(200).json({
                success: true,
                videoUrl: videoUrl
            });
        } else {
            throw new Error("No video URL returned in the Kling AI result payload.");
        }

    } catch (error) {
        console.error("\nFailed to generate video.");
        
        if (error.status === 402 || (error.body && JSON.stringify(error.body).includes("credit"))) {
            return res.status(402).json({
                success: false,
                error: "Insufficient fal.ai credits. Please top up your fal.ai account balance."
            });
        }

        return res.status(500).json({
            success: false,
            error: error.message || "Failed to generate video through the Kling AI server pipeline."
        });
    }
});

/**
 * Route: POST /api/generate-podcast
 */
app.post('/api/generate-podcast', async (req, res) => {
    const { script } = req.body;
    if (!script) return res.status(400).json({ success: false, error: "Script content is required." });

    if (MOCK_MODE) {
        return res.status(200).json({
            success: true,
            audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
        });
    }

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

// Start Express Server Listener
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  MAGIC TORTOISE BACKEND RUNNING ON PORT ${PORT}`);
    console.log(`  Kling 3.0 Audio Engine Active`);
    console.log(`====================================================`);
});
