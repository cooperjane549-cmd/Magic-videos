/**
 * General-Purpose Backend Server for Magic Tortoise (Render Deployment)
 * Communicates with fal.ai text-to-video API for any genre or format.
 * Bypasses Netlify's execution timeouts by using persistent HTTP polling via the SDK.
 */

const express = require('express');
const cors = require('cors');
const { fal } = require('@fal-ai/client');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable Cross-Origin Resource Sharing (CORS) 
// This allows your live Netlify frontend to securely request videos from your Render backend
app.use(cors({
    origin: '*' // In production, you can replace '*' with your actual Netlify URL for extra security
}));
app.use(express.json());

// Pulls your secret API key safely from Render's Env settings
fal.config({
    credentials: process.env.FAL_KEY
});

/**
 * Route: /api/generate-video
 * Handles incoming story segment configurations from your frontend web interface
 */
app.post('/api/generate-video', async (req, res) => {
    const { prompt, aspectRatio } = req.body;

    // Direct validation guardrail
    if (!process.env.FAL_KEY) {
        console.error("[Configuration Error]: FAL_KEY environment variable is missing on Render!");
        return res.status(500).json({ 
            success: false, 
            error: "Backend configuration error: FAL_KEY environment variable is missing on Render." 
        });
    }

    if (!prompt) {
        return res.status(400).json({ success: false, error: "Please enter a prompt description." });
    }

    const selectedRatio = aspectRatio || "9:16";

    console.log(`\n====================================================`);
    console.log(`[Video Requested] Aspect Ratio: ${selectedRatio}`);
    console.log(`[Prompt Input] "${prompt}"`);
    console.log(`====================================================`);

    try {
        // Utilizing Kling 3.0 Pro on fal.ai for fluid, cinematic multi-purpose video content
        const result = await fal.subscribe("fal-ai/kling/v3/pro/text-to-video", {
            input: {
                prompt: prompt,
                aspect_ratio: selectedRatio,
                duration: 5,           // Standard 5-second cinematic clip generation
                generate_audio: true   // Generates matching contextual background sounds automatically
            },
            logs: true,
            onQueueUpdate: (update) => {
                if (update.status === "IN_PROGRESS") {
                    console.log(`[fal.ai Queue]: Rendering frame sequence...`);
                }
            }
        });

        if (result && result.video && result.video.url) {
            console.log(`[Success] Video URL Generated: ${result.video.url}`);
            return res.status(200).json({
                success: true,
                videoUrl: result.video.url
            });
        } else {
            throw new Error("No video URL returned in the API result payload.");
        }

    } catch (error) {
        console.error("[Backend Error Processing Video]:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to generate video through the fal.ai server pipeline."
        });
    }
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  RENDER GENERAL VIDEO BACKEND RUNNING ON PORT ${PORT}`);
    console.log(`====================================================`);
});
