/**
 * General-Purpose Backend Server for Magic Tortoise (Render Deployment)
 * Powered by Kling AI (fal.ai) for multi-purpose video & audio content generation.
 */

const express = require('express');
const cors = require('cors');
const { fal } = require('@fal-ai/client');

const app = express();
const PORT = process.env.PORT || 10000;

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors({
    origin: '*'
}));

// Increase JSON limit to allow base64 image uploads for image-to-video requests
app.use(express.json({ limit: '50mb' }));

// Configure fal.ai SDK with API Key from Render environment variables
fal.config({
    credentials: process.env.FAL_KEY
});

// Admin Bypass Secret Key from Render Environment Variable
const ADMIN_BYPASS_KEY = process.env.ADMIN_BYPASS_KEY || "default_dev_passcode";

// Middleware helper to verify admin bypass status
const checkAdminBypass = (req) => {
    const clientHeaderKey = req.headers['x-admin-bypass'];
    return clientHeaderKey && clientHeaderKey === ADMIN_BYPASS_KEY;
};

/**
 * Route: GET /
 * Health check endpoint so browser visits display "Active" instead of "Cannot GET /"
 */
app.get('/', (req, res) => {
    return res.status(200).send('Magic Tortoise Backend Engine is active and running smoothly!');
});

/**
 * Route: POST /api/generate-video
 * Handles Kling 3.0 Text-to-Video and Image-to-Video requests
 */
app.post('/api/generate-video', async (req, res) => {
    const isAdmin = checkAdminBypass(req);
    const { prompt, aspectRatio, image } = req.body;

    // Configuration Guardrail
    if (!process.env.FAL_KEY) {
        console.error("[Configuration Error]: FAL_KEY environment variable is missing on Render!");
        return res.status(500).json({ 
            success: false, 
            error: "Backend configuration error: FAL_KEY environment variable is missing on Render." 
        });
    }

    if (!prompt && !image) {
        return res.status(400).json({ success: false, error: "Please provide a prompt description or an image." });
    }

    const selectedRatio = aspectRatio || "9:16";

    console.log(`\n====================================================`);
    console.log(`[Video Request] Admin Bypass Active: ${isAdmin}`);
    console.log(`[Aspect Ratio] ${selectedRatio}`);
    console.log(`[Prompt] "${prompt || 'Image animation'}"`);
    console.log(`====================================================`);

    try {
        let endpoint;
        let inputPayload;

        if (image) {
            // Kling 3.0 Standard Image-to-Video
            console.log("Routing request to Kling 3.0 (Image-to-Video)...");
            endpoint = "fal-ai/kling-video/v3/standard/image-to-video";
            inputPayload = {
                prompt: prompt || "",
                start_image_url: image,
                duration: "5",
                generate_audio: true
            };
        } else {
            // Kling 3.0 Standard Text-to-Video
            console.log("Routing request to Kling 3.0 (Text-to-Video)...");
            endpoint = "fal-ai/kling-video/v3/standard/text-to-video";
            inputPayload = {
                prompt: prompt,
                aspect_ratio: selectedRatio,
                duration: "5",
                generate_audio: true
            };
        }

        // Send generation request to fal.ai
        const result = await fal.subscribe(endpoint, {
            input: inputPayload,
            logs: true,
            onQueueUpdate: (update) => {
                if (update.status === "IN_PROGRESS") {
                    console.log(`[fal.ai Kling Queue]: Rendering video sequence...`);
                }
            }
        });

        // Extract video URL safely from payload response
        const videoUrl = result.data?.video?.url || result.video?.url;

        if (videoUrl) {
            console.log(`[Success] Kling Video Generated: ${videoUrl}`);
            return res.status(200).json({
                success: true,
                videoUrl: videoUrl
            });
        } else {
            throw new Error("No video URL returned in the Kling AI result payload.");
        }

    } catch (error) {
        console.error("[Backend Error Processing Video]:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to generate video through the Kling AI server pipeline."
        });
    }
});

/**
 * Route: POST /api/generate-podcast
 * Handles Text-to-Speech Audio Generation for Podcasts
 */
app.post('/api/generate-podcast', async (req, res) => {
    const isAdmin = checkAdminBypass(req);
    const { script } = req.body;

    if (!script) {
        return res.status(400).json({ success: false, error: "Script content is required." });
    }

    console.log(`\n[Podcast Request] Admin Bypass Active: ${isAdmin}`);

    try {
        const result = await fal.subscribe("fal-ai/playht/tts/v3", {
            input: {
                prompt: script,
                voice: "s3://voice-cloning-zero-shot/d9ff781e-aa10-4bc3-95e2-be00ca09b1bb/gloriasaad/manifest.json"
            }
        });

        const audioUrl = result.data?.audio?.url || result.audio?.url;

        if (audioUrl) {
            console.log(`[Success] Podcast Audio Generated: ${audioUrl}`);
            return res.status(200).json({
                success: true,
                audioUrl: audioUrl
            });
        } else {
            throw new Error("No audio URL returned in the TTS payload.");
        }

    } catch (error) {
        console.error("[Backend Error Processing Audio]:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to synthesize podcast audio."
        });
    }
});

// Start Server Listener
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  MAGIC TORTOISE BACKEND RUNNING ON PORT ${PORT}`);
    console.log(`  Kling 3.0 Engine & Admin Bypass Active`);
    console.log(`====================================================`);
});
