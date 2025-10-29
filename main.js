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

// Premium API endpoints
const API_ENDPOINTS = [
  'api19-core-c-alisg.tiktokv.com',
  'api16-core-c-alisg.tiktokv.com',
  'api19-normal-c-useast1a.tiktokv.com',
  'api16-normal-c-alisg.tiktokv.com'
];

function getRandomEndpoint() {
  return API_ENDPOINTS[Math.floor(Math.random() * API_ENDPOINTS.length)];
}

// Premium User Agents
const USER_AGENTS = [
  'TikTok 28.5.5 rv:285505 (iPhone; iOS 16.6; en_US) Cronet',
  'TikTok 28.5.5 (iPhone; iOS 17.0; Scale/3.00; en_US)',
  'TikTok 28.5.5 (iPad; iOS 16.5; Scale/2.00; en_US)',
  'com.ss.android.ugc.trill/280505 (Linux; U; Android 13; en_US; SM-G998B; Build/TP1A.220624.014; Cronet)'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/status', (req, res) => {
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
  startBot();
  
  res.json({ 
    success: true, 
    message: '🚀 Premium Bot Started!',
    target: botStatus.targetViews,
    videoId: botStatus.aweme_id
  });
});

app.post('/stop', (req, res) => {
  isRunning = false;
  botStatus.running = false;
  res.json({ success: true, message: '🛑 Bot Stopped' });
});

// Enhanced Gorgon Algorithm
function generateGorgon(params, unix) {
  const randomHex = crypto.randomBytes(16).toString('hex');
  return {
    'X-Gorgon': '0404c0d30000' + randomHex.slice(0, 24),
    'X-Khronos': unix.toString()
  };
}

function sendRequest(did, iid, cdid, openudid, aweme_id) {
  return new Promise((resolve) => {
    if (!isRunning) {
      resolve();
      return;
    }

    const params = `device_id=${did}&iid=${iid}&device_type=SM-G998B&app_name=musically_go&host_abi=arm64-v8a&channel=googleplay&device_platform=android&version_code=280505&device_brand=samsung&os_version=13&aid=1340`;
    const payload = `item_id=${aweme_id}&play_delta=1`;
    const sig = generateGorgon(params, Math.floor(Date.now() / 1000));
    
    const options = {
      hostname: getRandomEndpoint(),
      port: 443,
      path: `/aweme/v1/aweme/stats/?${params}`,
      method: 'POST',
      headers: {
        'cookie': 'sessionid=' + crypto.randomBytes(20).toString('hex'),
        'x-gorgon': sig['X-Gorgon'],
        'x-khronos': sig['X-Khronos'],
        'user-agent': getRandomUserAgent(),
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'accept-encoding': 'gzip, deflate, br',
        'accept': 'application/json',
        'connection': 'Keep-Alive',
        'content-length': Buffer.byteLength(payload)
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        botStatus.reqs++;
        try {
          if (res.statusCode === 200) {
            const jsonData = JSON.parse(data);
            if (jsonData && (jsonData.log_pb || jsonData.status_code === 0)) {
              botStatus.success++;
              console.log(`✅ [SUCCESS] ${botStatus.success}/${botStatus.targetViews}`);
            } else {
              botStatus.fails++;
            }
          } else {
            botStatus.fails++;
          }
        } catch (e) {
          botStatus.fails++;
        }
        
        if (botStatus.success >= botStatus.targetViews) {
          console.log('🎉 Target achieved!');
          isRunning = false;
          botStatus.running = false;
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      botStatus.fails++;
      botStatus.reqs++;
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      botStatus.fails++;
      botStatus.reqs++;
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
  
  // Better batch control
  const results = await Promise.allSettled(promises);
  return results;
}

async function startBot() {
  console.log('🚀 Starting Premium TikTok Bot...');
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

  console.log(`📱 Loaded ${devices.length} premium devices`);
  
  const concurrency = 30; // Optimized for success
  let lastReqs = 0;

  // Enhanced stats calculator
  const statsInterval = setInterval(() => {
    botStatus.rps = ((botStatus.reqs - lastReqs) / 2).toFixed(1);
    botStatus.rpm = (botStatus.rps * 60).toFixed(1);
    lastReqs = botStatus.reqs;
    
    const total = botStatus.reqs;
    const success = botStatus.success;
    botStatus.successRate = total > 0 ? ((success / total) * 100).toFixed(1) + '%' : '0%';
    
    console.log(`📊 Stats: ${botStatus.success}/${botStatus.targetViews} | Rate: ${botStatus.successRate} | RPS: ${botStatus.rps}`);
    
    if (!isRunning) {
      clearInterval(statsInterval);
    }
  }, 2000);

  // Premium bot loop
  while (isRunning && botStatus.success < botStatus.targetViews) {
    const batchDevices = [];
    for (let i = 0; i < concurrency && i < devices.length; i++) {
      const randomDevice = devices[Math.floor(Math.random() * devices.length)];
      batchDevices.push(randomDevice);
    }
    
    await sendBatch(batchDevices, botStatus.aweme_id);
    
    // Smart delay based on success rate
    const currentRate = parseFloat(botStatus.successRate);
    const delay = currentRate < 20 ? 800 : 400;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  if (botStatus.success >= botStatus.targetViews) {
    console.log('🎉 Premium Mission Completed!');
    const successRate = ((botStatus.success / botStatus.reqs) * 100).toFixed(1);
    console.log(`📈 Final: ${botStatus.success} success, ${successRate}% rate`);
  }
  
  botStatus.running = false;
  clearInterval(statsInterval);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Premium Server running on port ${PORT}`);
  console.log(`🌐 Visit: https://tiktok-bot-v3-production.up.railway.app/`);
});
