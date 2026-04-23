const Fastify = require("fastify");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3001;
const HISTORY_FILE = path.join(__dirname, 'taixiu_history.json');

let rikResults = [];
let rikCurrentSession = null;
let rikWS = null;
let rikIntervalCmd = null;
let reconnectTimeout = null;
let isAuthenticated = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Load lịch sử
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            rikResults = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
            console.log(`📚 Loaded ${rikResults.length} history records`);
        }
    } catch (err) {
        console.error('Error loading history:', err);
    }
}

// Lưu lịch sử
function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(rikResults), 'utf8');
    } catch (err) {
        console.error('Error saving history:', err);
    }
}

// Xác định Tài/Xỉu
function getTX(d1, d2, d3) {
    return d1 + d2 + d3 >= 11 ? "T" : "X";
}

// Gửi lệnh định kỳ - ĐÃ NÂNG CẤP
function sendPeriodicCommands() {
    if (rikWS?.readyState === WebSocket.OPEN && isAuthenticated) {
        try {
            // Lệnh 1005 để lấy lịch sử - QUAN TRỌNG
            const cmd1005 = [
                6,
                "MiniGame",
                "taixiuPlugin",
                {
                    "cmd": 1005,
                    "sid": rikCurrentSession || 0
                }
            ];
            rikWS.send(JSON.stringify(cmd1005));
            
            // Lệnh 10001 để giữ kết nối
            const cmd10001 = [
                6,
                "MiniGame", 
                "lobbyPlugin",
                {
                    "cmd": 10001
                }
            ];
            rikWS.send(JSON.stringify(cmd10001));
            
            // Thêm lệnh 1003 để lấy kết quả hiện tại
            const cmd1003 = [
                6,
                "MiniGame",
                "taixiuPlugin", 
                {
                    "cmd": 1003
                }
            ];
            rikWS.send(JSON.stringify(cmd1003));
            
            console.log("📤 Sent periodic commands: 1005, 10001, 1003");
        } catch (err) {
            console.error("Error sending commands:", err);
        }
    }
}

// Ping để giữ kết nối
function sendPing() {
    if (rikWS?.readyState === WebSocket.OPEN) {
        try {
            rikWS.ping();
        } catch (err) {
            console.error("Ping error:", err);
        }
    }
}

// Kết nối WebSocket với token thật - ĐÃ NÂNG CẤP
function connectWebSocket() {
    console.log(`🔌 Connecting to WebSocket... Attempt ${reconnectAttempts + 1}`);
    
    try {
        // Clear existing connection
        if (rikWS) {
            rikWS.removeAllListeners();
            if (rikWS.readyState === WebSocket.OPEN) {
                rikWS.close();
            }
        }

        rikWS = new WebSocket("wss://websocket.gmwin.io/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJnZW13aW4xMjMiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMTc3ODQwNDAsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJ0aW1lc3RhbXAiOjE3NTg4OTg5NDU5NjIsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjM3ODo2MzNhOjg5OGQ6MWM1Yzo5OTYxOmVjMTQiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzE3LnBuZyIsInBsYXRmb3JtSWQiOjUsInVzZXJJZCI6IjJhOWYxNWViLTYzYWYtNDM5YS05ZjJmLTQwYjUyZTVhOWMxZiIsInJlZ1RpbWUiOjE3NTgyOTQzMjY3MDIsInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01feGluYXBpc3VuIn0.BYc0EQLTALiFzSm-eJj37A5YWGsYhXyzj5ayV49XIQE", {
            handshakeTimeout: 10000,
            perMessageDeflate: false
        });

        rikWS.on('open', () => {
            console.log("✅ WebSocket connected");
            clearTimeout(reconnectTimeout);
            reconnectAttempts = 0;
            isAuthenticated = false;
            
            // Gửi xác thực
            const authPayload = [
                1,
                "MiniGame",
                "GM_xinapisun",
                "123321",
                {
                    "info": "{\"ipAddress\":\"2402:800:6378:633a:898d:1c5c:9961:ec14\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJnZW13aW4xMjMiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMTc3ODQwNDAsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJ0aW1lc3RhbXAiOjE3NTg4OTg5NDU5NjIsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjM3ODo2MzNhOjg5OGQ6MWM1Yzo5OTYxOmVjMTQiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzE3LnBuZyIsInBsYXRmb3JtSWQiOjUsInVzZXJJZCI6IjJhOWYxNWViLTYzYWYtNDM5YS05ZjJmLTQwYjUyZTVhOWMxZiIsInJlZ1RpbWUiOjE3NTgyOTQzMjY3MDIsInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01feGluYXBpc3VuIn0.BYc0EQLTALiFzSm-eJj37A5YWGsYhXyzj5ayV49XIQE\",\"locale\":\"vi\",\"userId\":\"2a9f15eb-63af-439a-9f2f-40b52e5a9c1f\",\"username\":\"GM_xinapisun\",\"timestamp\":1758898945962,\"refreshToken\":\"233962e18a194ccc9615cfebf0029766.9a095fdf28814993ae22642137158144\"}",
                    "signature": "1224E282F8E651385CD6073CC31B502E6CF18BE0073E508E8116F975BCA732D2B88E2F4A891A05608F7C81768EA87F0C0CF644410D27305DCCFD84716666EF3429A5140C48B9152C9A0BACC0696A7CC5C5E2AE6F6A085FDC7F5031819583C1177C13CC47E83D5AE49585430E459B7FDF30DAFE0F94EC3EF7FE9CC9720D39188C"
                }
            ];
            
            rikWS.send(JSON.stringify(authPayload));
            console.log("🔐 Sent authentication");
        });

        rikWS.on('message', (data) => {
            try {
                const json = JSON.parse(data.toString());
                console.log("📨 Received:", JSON.stringify(json).substring(0, 200) + "...");
                
                // Xử lý xác thực thành công
                if (Array.isArray(json) && json[0] === 1 && json[1] === true) {
                    isAuthenticated = true;
                    console.log("✅ Authentication successful");
                    
                    // Bắt đầu gửi lệnh định kỳ
                    clearInterval(rikIntervalCmd);
                    rikIntervalCmd = setInterval(sendPeriodicCommands, 3000); // Giảm thời gian xuống 3s
                    
                    // Bắt đầu ping định kỳ
                    setInterval(sendPing, 30000); // Ping mỗi 30s
                    
                    // Gửi ngay lần đầu
                    setTimeout(sendPeriodicCommands, 500);
                    return;
                }
                
                // Xử lý lấy mã phiên từ cmd 1008
                if (Array.isArray(json) && json[1]?.cmd === 1008 && json[1]?.sid) {
                    const sid = json[1].sid;
                    if (!rikCurrentSession || sid > rikCurrentSession) {
                        rikCurrentSession = sid;
                        console.log(`📋 Phiên hiện tại: ${sid}`);
                    }
                    return;
                }
                
                // Xử lý kết quả từ cmd 1003 và 1004
                if (Array.isArray(json) && (json[1]?.cmd === 1003 || json[1]?.cmd === 1004) && 
                    json[1]?.d1 !== undefined && json[1]?.d2 !== undefined && json[1]?.d3 !== undefined) {
                    
                    const res = json[1];
                    if (rikCurrentSession && (!rikResults[0] || rikResults[0].sid !== rikCurrentSession)) {
                        rikResults.unshift({ 
                            sid: rikCurrentSession, 
                            d1: res.d1, 
                            d2: res.d2, 
                            d3: res.d3, 
                            timestamp: Date.now() 
                        });
                        if (rikResults.length > 100) rikResults.pop();
                        saveHistory();
                        console.log(`🎲 Phiên ${rikCurrentSession} → ${getTX(res.d1, res.d2, res.d3)} (${res.d1},${res.d2},${res.d3})`);
                    }
                    return;
                }
                
                // Xử lý lịch sử từ cmd 1005
                if (Array.isArray(json) && json[1]?.cmd === 1005 && json[1]?.htr) {
                    const newHistory = json[1].htr.map(i => ({
                        sid: i.sid, 
                        d1: i.d1, 
                        d2: i.d2, 
                        d3: i.d3, 
                        timestamp: Date.now()
                    })).sort((a, b) => b.sid - a.sid);
                    
                    if (newHistory.length > 0) {
                        rikResults = newHistory.slice(0, 100);
                        saveHistory();
                        console.log(`📦 Loaded ${newHistory.length} history records`);
                    }
                    return;
                }
                
            } catch (e) {
                console.error("Parse error:", e.message);
            }
        });

        rikWS.on('close', (code, reason) => {
            console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
            isAuthenticated = false;
            clearInterval(rikIntervalCmd);
            
            // Exponential backoff cho reconnect
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            console.log(`Reconnecting in ${delay}ms...`);
            
            reconnectTimeout = setTimeout(connectWebSocket, delay);
        });

        rikWS.on('error', (err) => {
            console.error("WebSocket error:", err.message);
            isAuthenticated = false;
        });

        rikWS.on('pong', () => {
            console.log("❤️ Received pong");
        });

    } catch (err) {
        console.error("Failed to create WebSocket:", err.message);
        reconnectTimeout = setTimeout(connectWebSocket, 5000);
    }
}

// API endpoints
fastify.register(require('@fastify/cors'));

fastify.get("/api/taixiu/sunwin", async () => {
    const valid = rikResults.filter(r => r.d1 !== undefined && r.d2 !== undefined && r.d3 !== undefined);
    if (!valid.length) return { message: "Không có dữ liệu." };

    const current = valid[0];
    const sum = current.d1 + current.d2 + current.d3;
    
    return {
        phien: current.sid,
        xuc_xac_1: current.d1,
        xuc_xac_2: current.d2,
        xuc_xac_3: current.d3,
        tong: sum,
        ket_qua: sum >= 11 ? "Tài" : "Xỉu",
        phien_hien_tai: rikCurrentSession || current.sid + 1,
        status: isAuthenticated ? "connected" : "disconnected"
    };
});

fastify.get("/api/taixiu/history", async () => {
    const valid = rikResults.filter(r => r.d1 !== undefined && r.d2 !== undefined && r.d3 !== undefined);
    return valid.map(i => ({
        phien: i.sid,
        xuc_xac_1: i.d1,
        xuc_xac_2: i.d2,
        xuc_xac_3: i.d3,
        tong: i.d1 + i.d2 + i.d3,
        ket_qua: getTX(i.d1, i.d2, i.d3) === "T" ? "Tài" : "Xỉu"
    }));
});

// Khởi động server
const start = async () => {
    try {
        loadHistory();
        connectWebSocket();
        
        await fastify.listen({ port: PORT, host: "0.0.0.0" });
        console.log(`🚀 API chạy tại port ${PORT}`);
    } catch (err) {
        console.error("Server error:", err);
        process.exit(1);
    }
};

start();
