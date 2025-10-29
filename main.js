const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Global variables
let botStatus = {
  running: false,
  success: 0,
  fails: 0,
  reqs: 0,
  targetViews: 0,
  aweme_id: '',
  startTime: null,
  rps: 0,
  rpm: 0,
  successRate: '0%'
};

let isRunning = false;

// Updated API endpoints
const API_ENDPOINTS = [
  'api16-va.tiktokv.com',
  'api19-normal-c-useast1a.tiktokv.com', 
  'api16-normal-c-alisg.tiktokv.com',
  'api19-core-c-alisg.tiktokv.com',
  'api16-core-c-alisg.tiktokv.com'
];

function getRandomEndpoint() {
  return API_ENDPOINTS[Math.floor(Math.random() * API_ENDPOINTS.length)];
}

// Updated User Agents
const USER_AGENTS = [
  'com.ss.android.ugc.trill/2613 (Linux; U; Android 11; en_US; SM-G973N; Build/RP1A.200720.012; Cronet/TTNetVersion:5a96487e 2022-09-01)',
  'TikTok 26.1.3 rv:261303 (iPhone; iOS 14.8.1; en_US) Cronet',
  'TikTok 26.1.3 (iPhone; iOS 15.4.1; Scale/3.00; en_US)',
  'TikTok 26.1.3 (iPad; iOS 15.4.1; Scale/2.00; en_US)'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/status', (req, res) => {
  // Calculate success rate
  const total = botStatus.reqs;
  const success = botStatus.success;
  botStatus.successRate = total > 0 ? ((success / total) * 100).toFixed(1) + '%' : '0%';
  
  res.json(botStatus);
});

app.post('/start', (req, res) => {
  const { targetViews, videoLink } = req.body;
  
  if (!targetViews || !videoLink) {
    return res.json({ success: false, message: 'Target views and video link required' });
  }

  const idMatch = videoLink.match(/\d{18,19}/g);
  if (!idMatch) {
    return res.json({ success: false, message: 'Invalid TikTok video link' });
  }

  // Reset stats
  botStatus = {
    running: true,
    success: 0,
    fails: 0,
    reqs: 0,
    targetViews: parseInt(targetViews),
    aweme_id: idMatch[0],
    startTime: new Date(),
    rps: 0,
    rpm: 0,
    successRate: '0%'
  };

  isRunning = true;
  
  // Start bot in background
  startBot();
  
  res.json({ 
    success: true, 
    message: 'Bot started successfully!',
    target: botStatus.targetViews,
    videoId: botStatus.aweme_id
  });
});

app.post('/stop', (req, res) => {
  isRunning = false;
  botStatus.running = false;
  res.json({ success: true, message: 'Bot stopped' });
});

// Bot functions
function gorgon(params, data, cookies, unix) {
  function md5(input) {
    return crypto.createHash('md5').update(input).digest('hex');
  }
  let baseStr = md5(params) + (data ? md5(data) : '0'.repeat(32)) + (cookies ? md5(cookies) : '0'.repeat(32));
  return {
    'X-Gorgon': '0404b0d30000' + crypto.randomBytes(16).toString('hex').slice(0, 24),
    'X-Khronos': unix.toString()
  };
}

function sendRequest(did, iid, cdid, openudid, aweme_id) {
  return new Promise((resolve) => {
    if (!isRunning) {
      resolve();
      return;
    }

    const params = `device_id=${did}&iid=${iid}&device_type=SM-G973N&app_name=musically_go&host_abi=armeabi-v7a&channel=googleplay&device_platform=android&version_code=300904&device_brand=samsung&os_version=11&aid=1340`;
    const payload = `item_id=${aweme_id}&play_delta=1`;
    const sig = gorgon(params, null, null, Math.floor(Date.now() / 1000));
    
    const options = {
      hostname: getRandomEndpoint(),
      port: 443,
      path: `/aweme/v1/aweme/stats/?${params}`,
      method: 'POST',
      headers: {
        'cookie': 'sessionid=' + crypto.randomBytes(16).toString('hex'),
        'x-gorgon': sig['X-Gorgon'],
        'x-khronos': sig['X-Khronos'],
        'user-agent': getRandomUserAgent(),
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'accept-encoding': 'gzip',
        'connection': 'Keep-Alive',
        'content-length': Buffer.byteLength(payload)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        botStatus.reqs++;
        try {
          const jsonData = JSON.parse(data);
          if (jsonData && (jsonData.log_pb || jsonData.status_code === 0)) {
            botStatus.success++;
            console.log(`✅ [SUCCESS] ${botStatus.success}/${botStatus.targetViews} | Total: ${botStatus.reqs}`);
          } else {
            botStatus.fails++;
            console.log(`❌ [FAILED] Response: ${JSON.stringify(jsonData).substring(0, 100)}`);
          }
        } catch (e) {
          botStatus.fails++;
          console.log(`❌ [ERROR] Parse error: ${e.message}`);
        }
        
        // Check if target achieved
        if (botStatus.success >= botStatus.targetViews) {
          console.log('🎉 Target achieved! Stopping bot...');
          isRunning = false;
          botStatus.running = false;
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      botStatus.fails++;
      botStatus.reqs++;
      console.log(`❌ [NETWORK ERROR] ${e.message}`);
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      botStatus.fails++;
      botStatus.reqs++;
      console.log('⏰ [TIMEOUT] Request timed out');
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

async function sendBatch(batchDevices, aweme_id) {
  const promises = batchDevices.map(device => {
    const parts = device.split(':');
    if (parts.length >= 4) {
      const [did, iid, cdid, openudid] = parts;
      return sendRequest(did, iid, cdid, openudid, aweme_id);
    }
    return Promise.resolve();
  });
  await Promise.all(promises);
}

async function startBot() {
  console.log('🤖 Starting TikTok View Bot...');
  console.log(`🎯 Target: ${botStatus.targetViews} views`);
  console.log(`📹 Video ID: ${botStatus.aweme_id}`);
  
  const devices = fs.existsSync('devices.txt') ? 
    fs.readFileSync('devices.txt', 'utf-8').split('\n').filter(Boolean) : [];
  
  if (devices.length === 0) {
    console.log('❌ No devices found!');
    botStatus.running = false;
    isRunning = false;
    return;
  }

  console.log(`📱 Loaded ${devices.length} devices`);
  
  const concurrency = 50; // Reduced for better success
  let lastReqs = 0;

  // RPS Calculator
  const statsInterval = setInterval(() => {
    botStatus.rps = ((botStatus.reqs - lastReqs) / 2).toFixed(1);
    botStatus.rpm = (botStatus.rps * 60).toFixed(1);
    lastReqs = botStatus.reqs;
    
    // Calculate success rate
    const total = botStatus.reqs;
    const success = botStatus.success;
    botStatus.successRate = total > 0 ? ((success / total) * 100).toFixed(1) + '%' : '0%';
    
    console.log(`📊 Stats: ${botStatus.success}/${botStatus.targetViews} | Success: ${botStatus.successRate} | RPS: ${botStatus.rps}`);
    
    if (!isRunning) {
      clearInterval(statsInterval);
    }
  }, 2000);

  // Main bot loop
  while (isRunning && botStatus.success < botStatus.targetViews) {
    const batchDevices = [];
    for (let i = 0; i < concurrency && i < devices.length; i++) {
      batchDevices.push(devices[Math.floor(Math.random() * devices.length)]);
    }
    
    await sendBatch(batchDevices, botStatus.aweme_id);
    
    // Increased delay for better success rate
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  if (botStatus.success >= botStatus.targetViews) {
    console.log('🎉 Target completed successfully!');
    const successRate = ((botStatus.success / botStatus.reqs) * 100).toFixed(1);
    console.log(`📈 Final Stats: ${botStatus.success} success, ${botStatus.fails} fails, ${successRate}% success rate`);
  }
  
  botStatus.running = false;
  clearInterval(statsInterval);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Visit: https://tiktok-bot-v3-production.up.railway.app`);
  console.log(`🤖 Bot Ready - Web Interface Available`);
});
