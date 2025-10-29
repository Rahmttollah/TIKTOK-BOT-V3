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
  endTime: null,
  rps: 0,
  rpm: 0,
  successRate: '0%',
  mode: 'target', // 'target', 'timer', 'both'
  timeLeft: 0
};

let isRunning = false;
let timerInterval;

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/status', (req, res) => {
  const total = botStatus.reqs;
  const success = botStatus.success;
  botStatus.successRate = total > 0 ? ((success / total) * 100).toFixed(1) + '%' : '0%';
  
  if (botStatus.mode === 'timer' || botStatus.mode === 'both') {
    const now = new Date().getTime();
    botStatus.timeLeft = Math.max(0, botStatus.endTime - now);
  }
  
  res.json(botStatus);
});

app.post('/start', (req, res) => {
  const { targetViews, videoLink, timerHours, timerMinutes, timerSeconds, mode } = req.body;
  
  console.log('Start request received:', { targetViews, videoLink, timerHours, timerMinutes, timerSeconds, mode });
  
  if (!videoLink) {
    return res.json({ success: false, message: 'Video link required' });
  }

  const idMatch = videoLink.match(/\d{18,19}/g);
  if (!idMatch) {
    return res.json({ success: false, message: 'Invalid TikTok video link' });
  }

  // Validate mode requirements
  if (mode === 'target' && (!targetViews || targetViews <= 0)) {
    return res.json({ success: false, message: 'Target views required for target mode' });
  }
  
  if (mode === 'timer' && !timerHours && !timerMinutes && !timerSeconds) {
    return res.json({ success: false, message: 'Timer duration required for timer mode' });
  }
  
  if (mode === 'both' && (!targetViews || targetViews <= 0) && (!timerHours && !timerMinutes && !timerSeconds)) {
    return res.json({ success: false, message: 'Either target views or timer duration required for both mode' });
  }

  // Calculate timer end time if timer mode
  let endTime = null;
  if (mode === 'timer' || mode === 'both') {
    const totalSeconds = (parseInt(timerHours) || 0) * 3600 + 
                        (parseInt(timerMinutes) || 0) * 60 + 
                        (parseInt(timerSeconds) || 0);
    if (totalSeconds > 0) {
      endTime = new Date().getTime() + (totalSeconds * 1000);
    }
  }

  // Reset stats
  botStatus = {
    running: true,
    success: 0,
    fails: 0,
    reqs: 0,
    targetViews: parseInt(targetViews) || 0,
    aweme_id: idMatch[0],
    startTime: new Date(),
    endTime: endTime,
    rps: 0,
    rpm: 0,
    successRate: '0%',
    mode: mode,
    timeLeft: endTime ? (endTime - new Date().getTime()) : 0
  };

  isRunning = true;
  
  console.log('Starting bot with config:', {
    target: botStatus.targetViews,
    videoId: botStatus.aweme_id,
    mode: botStatus.mode,
    endTime: botStatus.endTime
  });
  
  // Start bot in background
  startBot();
  
  res.json({ 
    success: true, 
    message: 'Bot started successfully!',
    target: botStatus.targetViews,
    videoId: botStatus.aweme_id,
    mode: botStatus.mode
  });
});

app.post('/stop', (req, res) => {
  isRunning = false;
  botStatus.running = false;
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  res.json({ success: true, message: 'Bot stopped' });
});

// Original Gorgon function (Your working one)
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
      timeout: 3000 // Reduced timeout for speed
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
          if (jsonData && jsonData.log_pb && jsonData.log_pb.impr_id) {
            botStatus.success++;
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
  console.log('🚀 STARTING TIKTOK BOT - MAX SPEED MODE');
  
  const devices = fs.existsSync('devices.txt') ? 
    fs.readFileSync('devices.txt', 'utf-8').split('\n').filter(Boolean) : [];
  
  if (devices.length === 0) {
    console.log('❌ No devices found!');
    botStatus.running = false;
    isRunning = false;
    return;
  }

  console.log(`📱 Loaded ${devices.length} devices`);
  console.log(`🎯 Mode: ${botStatus.mode}`);
  console.log(`📹 Video ID: ${botStatus.aweme_id}`);
  
  if (botStatus.mode === 'target') {
    console.log(`🎯 Target: ${botStatus.targetViews} views`);
  }
  if (botStatus.mode === 'timer' || botStatus.mode === 'both') {
    console.log(`⏰ End Time: ${new Date(botStatus.endTime).toLocaleTimeString()}`);
  }

  // MAXIMUM SPEED - No concurrency limit, minimal delay
  const concurrency = 500; // Maximum concurrency
  let lastReqs = 0;

  // Timer check for timer mode
  if (botStatus.mode === 'timer' || botStatus.mode === 'both') {
    timerInterval = setInterval(() => {
      const now = new Date().getTime();
      if (now >= botStatus.endTime) {
        console.log('⏰ Timer finished! Stopping bot...');
        isRunning = false;
        botStatus.running = false;
        clearInterval(timerInterval);
      }
    }, 1000);
  }

  // RPS Calculator
  const statsInterval = setInterval(() => {
    botStatus.rps = ((botStatus.reqs - lastReqs) / 1).toFixed(1);
    botStatus.rpm = (botStatus.rps * 60).toFixed(1);
    lastReqs = botStatus.reqs;
    
    const total = botStatus.reqs;
    const success = botStatus.success;
    botStatus.successRate = total > 0 ? ((success / total) * 100).toFixed(1) + '%' : '0%';
    
    console.log(`📊 ${botStatus.success}/${botStatus.targetViews} | Rate: ${botStatus.successRate} | RPS: ${botStatus.rps}`);
    
    if (!isRunning) {
      clearInterval(statsInterval);
      if (timerInterval) clearInterval(timerInterval);
    }
  }, 1000);

  // MAIN BOT LOOP - MAXIMUM SPEED
  console.log('🔥 Starting maximum speed requests...');
  
  while (isRunning) {
    // Check stop conditions based on mode
    let shouldStop = false;
    
    if (botStatus.mode === 'target') {
      shouldStop = botStatus.success >= botStatus.targetViews;
    } else if (botStatus.mode === 'timer') {
      shouldStop = new Date().getTime() >= botStatus.endTime;
    } else if (botStatus.mode === 'both') {
      const targetReached = botStatus.targetViews > 0 && botStatus.success >= botStatus.targetViews;
      const timerFinished = botStatus.endTime && new Date().getTime() >= botStatus.endTime;
      shouldStop = targetReached || timerFinished;
    }
    
    if (shouldStop) {
      console.log('🛑 Stop condition met!');
      break;
    }

    // Send maximum concurrent requests
    const batchDevices = [];
    for (let i = 0; i < concurrency && i < devices.length; i++) {
      batchDevices.push(devices[Math.floor(Math.random() * devices.length)]);
    }
    
    await sendBatch(batchDevices, botStatus.aweme_id);
    
    // MINIMAL DELAY FOR MAXIMUM SPEED - Only 10ms
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Cleanup
  isRunning = false;
  botStatus.running = false;
  clearInterval(statsInterval);
  if (timerInterval) clearInterval(timerInterval);
  
  console.log('🛑 Bot stopped');
  const successRate = botStatus.reqs > 0 ? ((botStatus.success / botStatus.reqs) * 100).toFixed(1) : 0;
  console.log(`📈 Final Stats: ${botStatus.success} success, ${botStatus.fails} fails, ${successRate}% success rate`);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔥 MAXIMUM SPEED MODE ACTIVATED`);
});
