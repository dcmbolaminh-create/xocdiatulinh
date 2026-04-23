const Fastify = require("fastify");
const cors = require("@fastify/cors");
const axios = require("axios");
const crypto = require("crypto");
const WebSocket = require("ws");

const fastify = Fastify({ logger: false });

const PORT = process.env.PORT || 3000;
const API_URL = "https://api100.azhkthg1.net/gameapi/public/jackpot/all";

// KEY bí mật
const SECRET_KEY = "VMINH_SUPER_KEY_2026";

// Fix tiếng Việt
function fixVietnamese(str) {
    try {
        return Buffer.from(str, "latin1").toString("utf8");
    } catch {
        return str;
    }
}

// ===== TOKEN =====
function createToken() {
    const time = Date.now();
    const hash = crypto
        .createHmac("sha256", SECRET_KEY)
        .update(time.toString())
        .digest("hex");

    return `${time}.${hash}`;
}

function verifyToken(token) {
    if (!token) return false;

    const [time, hash] = token.split(".");
    const now = Date.now();

    if (now - time > 10000) return false;

    const validHash = crypto
        .createHmac("sha256", SECRET_KEY)
        .update(time)
        .digest("hex");

    return hash === validHash;
}

// ===== ROUTES =====

// Lấy token
fastify.get("/get-token", async () => {
    return {
        token: createToken(),
        owner: "@vanminh2603"
    };
});

// VIP (có token)
fastify.get("/xocdia", async (req, reply) => {
    const token = req.headers["x-token"];

    if (!verifyToken(token)) {
        return {
            status: false,
            message: "Blocked",
            owner: "@vanminh2603"
        };
    }

    try {
        const res = await axios.get(API_URL);

        const data = res.data.data.jackpots
            .filter(g => g.gameId === 14)
            .map(g => ({
                gameName: fixVietnamese(g.gameName),
                balance: g.balance
            }));

        return {
            status: true,
            type: "vip",
            owner: "@vanminh2603",
            data
        };
    } catch {
        return { status: false };
    }
});

// PUBLIC
fastify.get("/xocdiav1", async () => {
    try {
        const res = await axios.get(API_URL);

        const data = res.data.data.jackpots
            .filter(g => g.gameId === 14)
            .map(g => ({
                gameName: fixVietnamese(g.gameName),
                balance: g.balance
            }));

        return {
            status: true,
            type: "public",
            version: "v1",
            owner: "@vanminh2603",
            data
        };
    } catch {
        return {
            status: false,
            owner: "@vanminh2603"
        };
    }
});

// ===== START SERVER + WS =====
const start = async () => {
    await fastify.register(cors, { origin: true });

    const server = await fastify.listen({
        port: PORT,
        host: "0.0.0.0"
    });

    const wss = new WebSocket.Server({ server });

    setInterval(async () => {
        try {
            const res = await axios.get(API_URL);

            const data = res.data.data.jackpots
                .filter(g => g.gameId === 14)
                .map(g => ({
                    gameName: fixVietnamese(g.gameName),
                    balance: g.balance
                }));

            const payload = JSON.stringify({
                type: "realtime",
                owner: "@vanminh2603",
                data
            });

            wss.clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(payload);
                }
            });

        } catch {}
    }, 3000);

    console.log("🔥 Server chạy tại port " + PORT);
};

start();
