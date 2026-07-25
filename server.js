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
app.use(cors({ origin: '*' }));

// Increase JSON limit to allow base64 image uploads
app.use(express.json({ limit: '50mb' }));

// Configure fal.ai SDK with API Key from Render environment variables
fal.config({
    credentials: process.env.FAL_KEY
});

// Admin Bypass Secret Key from Render Environment Variable
const ADMIN_BYPASS_KEY = process.env.ADMIN_BYPASS_KEY || "default_dev_passcode";

const checkAdminBypass = (req) => {
    const clientHeaderKey = req.headers['x-admin-bypass'];
    return clientHeaderKey && clientHeaderKey === ADMIN_BYPASS_KEY;
};

app.get('/', (req, res) => {
    return res.status(200).send('Magic Tortoise Backend Engine is active and running smoothly!');
});

app.post('/api/generate-video', async (req, res) => {
    const isAdmin = checkAdminBypass(req);
    const { prompt, aspectRatio, image } = req.body;

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

    let selectedRatio = "9:16";
    if (aspectRatio === "16:9" || aspectRatio === "1:1" || aspectRatio === "9:16") {
        selectedRatio = aspectRatio;
    }

    console.log(`\n====================================================`);
    console.log(`[Video Request] Admin Bypass Active: ${isAdmin}`);
    console.log(`[Aspect Ratio] ${selectedRatio}`);
    console.log(`[Prompt] "${prompt || 'Image animation'}"`);
    console.log(`====================================================`);

    try {
        let endpoint;
        let inputPayload;

        if (image) {
            // Kling Image-to-Video (no aspect_ratio parameter allowed)
            endpoint = "fal-ai/kling-video/v1.5/standard/image-to-video";
            inputPayload = {
                prompt: prompt || "",
                image_url: image,
                duration: 5 // Must be a number integer (5 or 10)
            };
        } else {
            // Kling Text-to-Video
            endpoint = "fal-ai/kling-video/v1.5/standard/text-to-video";
            inputPayload = {
                prompt: prompt,
                aspect_ratio: selectedRatio,
                duration: 5 // Must be a number integer (5 or 10)
            };
        }

        const result = await fal.subscribe(endpoint, {
            input: inputPayload,
            logs: true
        });

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
        
        // Print the exact field that failed validation if fal rejects it
        if (error.body && error.body.detail) {
            console.error("[fal.ai Validation Details]:", JSON.stringify(error.body.detail));
        }

        return res.status(500).json({
            success: false,
            error: error.message || "Failed to generate video through the Kling AI server pipeline."
        });
    }
});

app.post('/api/generate-podcast', async (req, res) => {
    const isAdmin = checkAdminBypass(req);
    const { script } = req.body;

    if (!script) {
        return res.status(400).json({ success: false, error: "Script content is required." });
    }

    try {
        const result = await fal.subscribe("fal-ai/playht/tts/v3", {
            input: {
                prompt: script,
                voice: "s3://voice-cloning-zero-shot/d9ff781e-aa10-4bc3-95e2-be00ca09b1bb/gloriasaad/manifest.json"
            }
        });

        const audioUrl = result.data?.audio?.url || result.audio?.url;

        if (audioUrl) {
            return res.status(200).json({ success: true, audioUrl: audioUrl });
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

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  MAGIC TORTOISE BACKEND RUNNING ON PORT ${PORT}`);
    console.log(`====================================================`);
});
