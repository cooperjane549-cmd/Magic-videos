const ENABLE_FREE_MOCK_MODE = true; 

const express = require('express');
const cors = require('cors');
const { fal } = require('@fal-ai/client');
const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.firebaseio.com"
});

const db = admin.database();
const app = express();
const PORT = process.env.PORT || 10000;

const MOCK_MODE = process.env.MOCK_MODE ? process.env.MOCK_MODE === 'true' : ENABLE_FREE_MOCK_MODE;
const SAMPLE_MOCK_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
const VIDEO_GENERATION_COST = 120.0;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

fal.config({ credentials: process.env.FAL_KEY });

app.get('/', (req, res) => {
    return res.status(200).send(`Magic Tortoise Engine Active! [Mock Mode: ${MOCK_MODE}]`);
});

app.post('/api/generate-video', async (req, res) => {
    const { userId, prompt, aspectRatio, image } = req.body;
    const adminBypass = req.headers['x-admin-bypass'];

    if (!prompt && !image) {
        return res.status(400).json({ success: false, error: "Please provide a prompt description or an image." });
    }

    // Check if valid admin bypass key was entered in index.html
    const isAdminBypass = (adminBypass === "Tortoise0008");

    if (!isAdminBypass) {
        if (!userId) {
            return res.status(401).json({ success: false, error: "User authentication ID (userId) is required." });
        }

        const userBalanceRef = db.ref(`users/${userId}/balance`);

        // Server-side safe balance check & deduction
        const transactionResult = await userBalanceRef.transaction((currentBalance) => {
            if (currentBalance === null) return 0;
            if (currentBalance >= VIDEO_GENERATION_COST) {
                return currentBalance - VIDEO_GENERATION_COST;
            } else {
                return; // Abort
            }
        });

        if (!transactionResult.committed) {
            return res.status(402).json({
                success: false,
                error: `Insufficient balance. Generating an AI video costs KES ${VIDEO_GENERATION_COST.toFixed(2)}.`
            });
        }
    }

    try {
        if (MOCK_MODE) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            return res.status(200).json({
                success: true,
                videoUrl: SAMPLE_MOCK_VIDEO_URL
            });
        }

        let selectedRatio = "9:16";
        if (aspectRatio === "16:9" || aspectRatio === "1:1" || aspectRatio === "9:16") {
            selectedRatio = aspectRatio;
        }

        let endpoint = image 
            ? "fal-ai/kling-video/v3/standard/image-to-video" 
            : "fal-ai/kling-video/v3/standard/text-to-video";

        let inputPayload = image ? {
            prompt: prompt || "",
            start_image_url: image,
            duration: "5",
            generate_audio: true
        } : {
            prompt: prompt,
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
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to generate video."
        });
    }
});

app.listen(PORT, () => {
    console.log(`MAGIC TORTOISE BACKEND RUNNING ON PORT ${PORT}`);
});
