const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
  rpm: 0
};

let isRunning = false;

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/status', (req, res) => {
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
    rpm: 0
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
    'X-Gorgon': '0404b0d300000000000000000000000000000000',
    'X-Khronos': unix.toString()
  };
}

function sendRequest(did, iid, cdid, openudid, aweme_id) {
  return new Promise((resolve) => {
    if (!isRunning) {
      resolve();
      return;
    }

    const params = `device_id=${did}&iid=${iid}&device_type=SM-G973N&app_name=musically_go&host_abi=armeabi-v7a&channel=googleplay&device_platform=android&version_code=160904&device_brand=samsung&os_version=9&aid=1340`;
    const payload = `item_id=${aweme_id}&play_delta=1`;
    const sig = gorgon(params, null, null, Math.floor(Date.now() / 1000));
    
    const options = {
      hostname: 'api16-va.tiktokv.com',
      port: 443,
      path: `/aweme/v1/aweme/stats/?${params}`,
      method: 'POST',
      headers: {
        'cookie': 'sessionid=90c38a59d8076ea0fbc01c8643efbe47',
        'x-gorgon': sig['X-Gorgon'],
        'x-khronos': sig['X-Khronos'],
        'user-agent': 'okhttp/3.10.0.1',
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(payload)
      },
      timeout: 5000
    };

    const req = require('https').request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        botStatus.reqs++;
        try {
          const jsonData = JSON.parse(data);
          if (jsonData && jsonData.log_pb && jsonData.log_pb.impr_id) {
            botStatus.success++;
            console.log(`✅ ${botStatus.success}/${botStatus.targetViews}`);
            
            if (botStatus.success >= botStatus.targetViews) {
              console.log('🎉 Target achieved!');
              isRunning = false;
              botStatus.running = false;
            }
          } else {
            botStatus.fails++;
          }
        } catch (e) {
          botStatus.fails++;
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
    const [did, iid, cdid, openudid] = device.split(':');
    return sendRequest(did, iid, cdid, openudid, aweme_id);
  });
  await Promise.all(promises);
}

async function startBot() {
  console.log('🤖 Starting TikTok View Bot...');
  
  const devices = fs.existsSync('devices.txt') ? 
    fs.readFileSync('devices.txt', 'utf-8').split('\n').filter(Boolean) : [];
  
  const concurrency = 200;
  let lastReqs = 0;

  // RPS Calculator
  setInterval(() => {
    botStatus.rps = ((botStatus.reqs - lastReqs) / 2).toFixed(1);
    botStatus.rpm = (botStatus.rps * 60).toFixed(1);
    lastReqs = botStatus.reqs;
  }, 2000);

  // Main bot loop
  while (isRunning && botStatus.success < botStatus.targetViews) {
    const batchDevices = [];
    for (let i = 0; i < concurrency && i < devices.length; i++) {
      batchDevices.push(devices[Math.floor(Math.random() * devices.length)]);
    }
    await sendBatch(batchDevices, botStatus.aweme_id);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (botStatus.success >= botStatus.targetViews) {
    console.log('🎉 Target completed successfully!');
    botStatus.running = false;
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Visit: https://tiktok-bot-v3-production.up.railway.app`);
});
