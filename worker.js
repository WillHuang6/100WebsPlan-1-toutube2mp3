// 独立的后台worker - 可以在VPS或其他云服务器上运行
const Redis = require('ioredis');
const fetch = require('node-fetch');

// Redis连接
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

console.log('🚀 YouTube转换Worker启动...');

// 处理队列任务
async function processQueue() {
  while (true) {
    try {
      // 检查队列中是否有待处理任务
      const task = await redis.blpop('youtube_queue', 30); // 30秒超时
      
      if (task) {
        const [queueName, taskData] = task;
        const { taskId, url } = JSON.parse(taskData);
        
        console.log('📋 处理任务:', taskId);
        await processYouTubeTask(taskId, url);
      } else {
        console.log('⏳ 等待新任务...');
      }
    } catch (error) {
      console.error('💥 队列处理错误:', error);
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒后重试
    }
  }
}

async function processYouTubeTask(taskId, url) {
  const startTime = Date.now();
  
  try {
    // 更新任务状态为处理中
    await updateTaskStatus(taskId, { status: 'processing', progress: 10 });
    
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('无法提取视频ID');
    }
    
    // 调用RapidAPI
    console.log('📡 调用RapidAPI...', videoId);
    const response = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API错误: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ API响应:', data.status);
    
    await updateTaskStatus(taskId, { status: 'processing', progress: 50 });
    
    // 下载音频
    const downloadUrl = data.link || data.url || data.download_url;
    if (!downloadUrl) {
      throw new Error('无法获取下载链接');
    }
    
    console.log('📥 下载音频...');
    const audioResponse = await fetch(downloadUrl);
    if (!audioResponse.ok) {
      throw new Error(`下载失败: ${audioResponse.status}`);
    }
    
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    console.log(`✅ 下载完成: ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB`);
    
    await updateTaskStatus(taskId, { status: 'processing', progress: 90 });
    
    // 存储音频数据到Redis
    await redis.setex(`audio:${taskId}`, 86400, audioBuffer); // 24小时过期
    
    // 完成任务
    await updateTaskStatus(taskId, {
      status: 'finished',
      file_url: `/api/download/${taskId}`,
      progress: 100,
      title: data.title || 'YouTube Audio'
    });
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`🎉 任务完成: ${taskId}, 用时: ${processingTime}秒`);
    
  } catch (error) {
    console.error('❌ 任务处理失败:', error);
    await updateTaskStatus(taskId, {
      status: 'error',
      error: error.message
    });
  }
}

async function updateTaskStatus(taskId, updates) {
  const key = `task:${taskId}`;
  await redis.hmset(key, updates);
  await redis.expire(key, 86400); // 24小时过期
}

function extractVideoId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

// 启动worker
processQueue().catch(console.error);