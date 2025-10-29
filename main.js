const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline-sync');

let reqs = 0, success = 0, fails = 0;
let rps = 0, rpm = 0;
let targetViews = 0;
let isRunning = true;

const devices = fs.existsSync('devices.txt') ? fs.readFileSync('devices.txt', 'utf-8').split('\n').filter(Boolean) : [];
const proxies = fs.existsSync('proxies.txt') ? fs.readFileSync('proxies.txt', 'utf-8').split('\n').filter(Boolean) : [];

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

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                reqs++;
                try {
                    const jsonData = JSON.parse(data);
                    if (jsonData && jsonData.log_pb && jsonData.log_pb.impr_id) {
                        success++;
                        console.log(`✅ ${success}/${targetViews} | Req: ${reqs} | RPS: ${rps}`);
                        
                        // Target check
                        if (success >= targetViews) {
                            console.log('\n🎉 TARGET ACHIEVED! Stopping bot...');
                            isRunning = false;
                        }
                    } else {
                        fails++;
                    }
                } catch (e) {
                    fails++;
                }
                resolve();
            });
        });

        req.on('error', (e) => {
            fails++;
            reqs++;
            resolve();
        });

        req.on('timeout', () => {
            req.destroy();
            fails++;
            reqs++;
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

function statsLoop() {
    let lastReqs = reqs;
    setInterval(() => {
        rps = ((reqs - lastReqs) / 1.5).toFixed(1);
        rpm = (rps * 60).toFixed(1);
        lastReqs = reqs;
        
        if (isRunning) {
            console.log(`📊 Progress: ${success}/${targetViews} | Success: ${success} | Fails: ${fails} | RPS: ${rps}`);
        }
    }, 1500);
}

function printBanner() {
    console.clear();
    console.log('\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[36m║\x1b[0m                                                              \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  \x1b[35m🎯 TIKTOK VIEW BOT - TARGET MODE\x1b[0m                            \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  \x1b[33m⏰ 24/7 CLOUD RUNNING | AUTO STOP ON TARGET\x1b[0m                  \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m                                                              \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m               \x1b[33mCREATED BY: NAIMUL HACKER KING\x1b[0m               \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m                                                              \x1b[36m║\x1b[0m');
    console.log('\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
    console.log('');
}

async function main() {
    printBanner();
    
    console.log('\x1b[33m🚀 TikTok View Bot - Cloud Edition\x1b[0m\n');
    console.log('\x1b[36m📊 System Status:\x1b[0m');
    console.log(`   \x1b[36m• Devices Loaded: ${devices.length}\x1b[0m`);
    console.log(`   \x1b[36m• Proxies Loaded: ${proxies.length}\x1b[0m`);
    console.log('');

    // Get target views
    targetViews = readline.questionInt('🎯 Enter Target Views: ');
    
    if (isNaN(targetViews) || targetViews <= 0) {
        console.log('\x1b[31m❌ Invalid target views\x1b[0m');
        process.exit(0);
    }

    // Get video ID
    let aweme_id;
    const videoInput = readline.question('📹 Enter Video Link or ID: ');
    const idMatch = videoInput.match(/\d{18,19}/g);
    if (!idMatch) {
        console.log('\x1b[31m❌ Invalid video link or ID\x1b[0m');
        process.exit(0);
    }
    aweme_id = idMatch[0];

    if (devices.length === 0) {
        console.log('❌ devices.txt is empty or missing!');
        process.exit(1);
    }

    console.log(`\n\x1b[32m🎯 Target Views: ${targetViews}\x1b[0m');
    console.log(`\x1b[32m📹 Target Video ID: ${aweme_id}\x1b[0m`);
    console.log('\x1b[33m🚀 Starting cloud bot...\x1b[0m');
    console.log('\x1b[33m⏳ Bot will auto-stop when target reached\x1b[0m\n');

    statsLoop();

    const concurrency = 200;

    // MAIN BOT LOOP
    while (isRunning && success < targetViews) {
        const batchDevices = [];
        for (let i = 0; i < concurrency && i < devices.length; i++) {
            batchDevices.push(devices[Math.floor(Math.random() * devices.length)]);
        }
        await sendBatch(batchDevices, aweme_id);
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // TARGET COMPLETED
    console.log('\n\x1b[32m🎉 MISSION ACCOMPLISHED! 🎉\x1b[0m');
    console.log(`\x1b[32m✅ Successfully delivered: ${success} views\x1b[0m');
    console.log(`\x1b[36m📊 Final Stats:\x1b[0m');
    console.log(`   \x1b[36m• Successful: ${success}\x1b[0m');
    console.log(`   \x1b[36m• Failed: ${fails}\x1b[0m');
    console.log(`   \x1b[36m• Total Requests: ${reqs}\x1b[0m');
    console.log(`   \x1b[36m• Success Rate: ${((success/reqs)*100).toFixed(2)}%\x1b[0m');
    console.log('\n\x1b[33m👑 Thanks for using NAIMUL HACKER KING Viewbot!\x1b[0m');
    
    process.exit(0);
}

// Handle shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Manual shutdown detected...');
    console.log(`📈 Progress: ${success}/${targetViews} views`);
    isRunning = false;
    setTimeout(() => process.exit(0), 1000);
});

// Start the bot
main().catch(console.error);
