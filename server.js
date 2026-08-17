// =====================================================================
// 🚨 MOCK MODE SWITCH (SET TO true FOR FREE TESTING, false FOR REAL AI)
// =====================================================================
const ENABLE_FREE_MOCK_MODE = true; 
// =====================================================================

const express = require('express');
const cors = require('cors');
const { fal } = require('@fal-ai/client');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.firebaseio.com" // Replace with your DB URL
});

const db = admin.database();
const app = express();
const PORT = process.env.PORT || 10000;

const MOCK_MODE = process.env.MOCK_MODE ? process.env.MOCK_MODE === 'true' : ENABLE_FREE_MOCK_MODE;
const SAMPLE_MOCK_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
const VIDEO_GENERATION_COST = 120.0; // KES 120 per generation

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

fal.config({ credentials: process.env.FAL_KEY });

const sanitizePrompt = (rawPrompt) => {
    if (!rawPrompt) return "";
    return String(rawPrompt).trim().substring(0, 500);
};

app.get('/', (req, res) => {
    return res.status(200).send(`Magic Tortoise Engine Active! [Mock Mode: ${MOCK_MODE}]`);
});

/**
 * Route: POST /api/generate-video
 * Securely deducts KES 120 from Firebase on the server side before video creation.
 */
app.post('/api/generate-video', async (req, res) => {
    const { userId, prompt, aspectRatio, image } = req.body;

    if (!userId) {
        return res.status(401).json({ success: false, error: "User authentication ID (userId) is required." });
    }

    if (!prompt && !image) {
        return res.status(400).json({ success: false, error: "Please provide a prompt description or an image." });
    }

    const cleanedPrompt = sanitizePrompt(prompt);
    const userBalanceRef = db.ref(`users/${userId}/balance`);

    try {
        // SERVER-SIDE TRANSACTION: Check and deduct balance safely
        const transactionResult = await userBalanceRef.transaction((currentBalance) => {
            if (currentBalance === null) return 0; // Initialize if null
            if (currentBalance >= VIDEO_GENERATION_COST) {
                return currentBalance - VIDEO_GENERATION_COST; // Deduct cost
            } else {
                return; // Abort transaction (insufficient funds)
            }
        });

        if (!transactionResult.committed) {
            return res.status(402).json({
                success: false,
                error: `Insufficient balance. Generating an AI video costs KES ${VIDEO_GENERATION_COST.toFixed(2)}.`
            });
        }

        console.log(`[Billing Success] Deducted KES ${VIDEO_GENERATION_COST} from User ${userId}`);

        // FREE MOCK RESPONSE (Zero API charges)
        if (MOCK_MODE) {
            console.log('[MOCK MODE ACTIVE]: Bypassing fal.ai call. Returning sample video URL.');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return res.status(200).json({
                success: true,
                videoUrl: SAMPLE_MOCK_VIDEO_URL
            });
        }

        // LIVE PRODUCTION CALL TO FAL.AI
        let selectedRatio = "9:16";
        if (aspectRatio === "16:9" || aspectRatio === "1:1" || aspectRatio === "9:16") {
            selectedRatio = aspectRatio;
        }

        let endpoint = image 
            ? "fal-ai/kling-video/v3/standard/image-to-video" 
            : "fal-ai/kling-video/v3/standard/text-to-video";

        let inputPayload = image ? {
            prompt: cleanedPrompt || "",
            start_image_url: image,
            duration: "5",
            generate_audio: true
        } : {
            prompt: cleanedPrompt,
            aspect_ratio: selectedRatio,
            duration: "5",
            generate_audio: true
        };

        const result = await fal.subscribe(endpoint, { input: inputPayload, logs: true });
        const videoUrl = result.data?.video?.url || result.video?.url;

        if (videoUrl) {
            return res.status(200).json({ success: true, videoUrl: videoUrl });
        } else {
            throw new Error("No video URL returned in payload.");
        }

    } catch (error) {
        console.error("[Backend Error]:", error);
        
        // Refund user if billing succeeded but generation crashed
        await userBalanceRef.transaction((bal) => (bal || 0) + VIDEO_GENERATION_COST);
        console.log(`[Refund Issued] Refunded KES ${VIDEO_GENERATION_COST} to User ${userId}`);

        return res.status(500).json({
            success: false,
            error: error.message || "Failed to generate video. KES 120 has been refunded to your wallet."
        });
    }
});

app.listen(PORT, () => {
    console.log(`MAGIC TORTOISE BACKEND RUNNING ON PORT ${PORT}`);
});
