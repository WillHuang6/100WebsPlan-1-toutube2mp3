import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { taskManager } from '@/lib/tasks';
import crypto from 'crypto';

// 缓存
const urlCache = new Map<string, { file_url: string; created_at: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// 生成缓存键
function getCacheKey(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex');
}

// 验证YouTube URL
function isValidYouTubeUrl(url: string): boolean {
  const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
  return youtubeRegex.test(url);
}

// 主要转换函数 - 新架构：立即返回，后台处理
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { url, format } = await req.json();
    
    if (!isValidYouTubeUrl(url)) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }
    
    // 检查缓存
    const cacheKey = getCacheKey(url);
    const cached = urlCache.get(cacheKey);
    if (cached && Date.now() - cached.created_at < CACHE_DURATION) {
      const cachedTaskId = uuidv4();
      await taskManager.create(cachedTaskId, { 
        status: 'finished', 
        file_url: cached.file_url, 
        progress: 100 
      });
      console.log('🚀 缓存命中:', url);
      return NextResponse.json({ 
        task_id: cachedTaskId, 
        status: 'finished',
        message: '从缓存获取结果' 
      });
    }
    
    // 创建新任务
    const task_id = uuidv4();
    await taskManager.create(task_id, { 
      status: 'queued', 
      progress: 0,
      url: url,
      created_at: Date.now() 
    });

    console.log('🚀 任务创建:', task_id);
    console.log('📋 目标URL:', url);
    
    // 立即触发后台处理，不等待结果
    console.log('⚡ 触发后台处理...');
    console.log('🌍 环境变量检查:');
    console.log('  - VERCEL_URL:', process.env.VERCEL_URL);
    console.log('  - NEXT_PUBLIC_VERCEL_URL:', process.env.NEXT_PUBLIC_VERCEL_URL);
    
    try {
      // 使用外部HTTP调用来触发后台处理，确保不会被当前函数超时影响
      console.log('🚀 通过外部调用启动后台处理...');
      
      // 优先使用生产域名，避免预览部署的问题
      const processUrl = 'https://ytb2mp3.site';
      
      const fullUrl = `${processUrl}/api/process-task`;
      console.log('🌐 目标URL:', fullUrl);
      console.log('📦 请求数据:', { taskId: task_id, url });
      
      // 异步调用，不等待响应
      console.log('📡 发起fetch请求...');
      fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task_id, url })
      }).then(response => {
        console.log('✅ 后台处理触发响应:', response.status);
        if (!response.ok) {
          response.text().then(errorText => {
            console.error('❌ 后台处理触发失败:', errorText);
          });
        }
      }).catch(error => {
        console.error('❌ 后台处理触发异常:', error);
        console.error('❌ 错误详情:', error.message);
        console.error('❌ 错误名称:', error.name);
      });
      
      console.log('✅ 后台处理已外部触发');
      
    } catch (error) {
      console.error('❌ 启动后台处理失败:', error);
      await taskManager.update(task_id, {
        status: 'error',
        error: '无法启动处理任务，请稍后重试'
      });
      return NextResponse.json({ 
        error: 'Failed to start processing',
        task_id 
      }, { status: 500 });
    }
    
    // 定期清理过期缓存
    cleanupExpiredCache();
    
    const responseTime = Date.now() - startTime;
    console.log(`⚡ API响应时间: ${responseTime}ms`);
    
    // 立即返回任务ID和状态，不等待处理完成
    return NextResponse.json({ 
      task_id, 
      status: 'queued',
      message: '任务已创建，正在后台处理...',
      estimated_time: '通常需要1-5分钟'
    });
    
  } catch (error) {
    console.error('💥 convert API 错误:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: (error as Error).message 
    }, { status: 500 });
  }
}

// 提取视频ID
function extractVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

// 异步后台处理函数 - 不阻塞API响应
async function processTaskInBackground(taskId: string, url: string) {
  const startTime = Date.now();
  const cacheKey = getCacheKey(url);
  
  try {
    console.log('🎯 后台处理开始 - 任务ID:', taskId);
    
    // 检查缓存
    const cached = urlCache.get(cacheKey);
    if (cached && Date.now() - cached.created_at < CACHE_DURATION) {
      console.log('🚀 缓存命中:', url);
      await taskManager.update(taskId, { 
        status: 'finished', 
        file_url: cached.file_url, 
        progress: 100 
      });
      return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      await taskManager.update(taskId, { 
        status: 'error', 
        error: '无法提取视频ID' 
      });
      return;
    }

    // 更新为处理中
    await taskManager.update(taskId, { status: 'processing', progress: 10 });

    // 环境检测
    const isVercel = process.env.VERCEL === '1';
    console.log('🌐 后台处理环境:', isVercel ? 'Vercel' : '本地');

    if (isVercel) {
      await processWithAPIBackground(taskId, url, videoId, cacheKey, startTime);
    } else {
      // 本地环境可以使用yt-dlp
      await taskManager.update(taskId, {
        status: 'error',
        error: '本地yt-dlp处理暂未在异步架构中实现'
      });
    }

  } catch (error) {
    console.error('💥 后台处理失败:', error);
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    await taskManager.update(taskId, {
      status: 'error',
      error: `后台处理失败: ${(error as Error).message}\n处理时间: ${processingTime}秒`
    });
  }
}

// 使用API的后台处理（Vercel环境）
async function processWithAPIBackground(taskId: string, url: string, videoId: string, cacheKey: string, startTime: number) {
  console.log('🎯 后台API处理 - 视频ID:', videoId);
  
  // 检查API Key
  if (!process.env.RAPIDAPI_KEY) {
    await taskManager.update(taskId, {
      status: 'error',
      error: '配置错误：缺少API密钥'
    });
    return;
  }

  await taskManager.update(taskId, { status: 'processing', progress: 20 });

  try {
    console.log('📡 后台调用RapidAPI...');
    console.log('🔑 API Key存在:', !!process.env.RAPIDAPI_KEY);
    
    // 不设置超时限制，让它慢慢处理
    const apiUrl = `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`;
    console.log('🌐 API URL:', apiUrl);
    
    const fetchStartTime = Date.now();
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
      // 注意：这里没有signal: controller.signal，让它自然完成
    });
    
    const fetchDuration = Date.now() - fetchStartTime;
    console.log(`📡 后台API响应状态: ${response.status}, 用时: ${fetchDuration}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API错误: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('📋 后台API响应数据:', JSON.stringify(data, null, 2));

    // 解析下载链接
    let downloadUrl = null;
    if (data.status === 'ok' || data.status === 'success') {
      downloadUrl = data.link || data.url || data.download_url;
    }

    if (!downloadUrl) {
      throw new Error('无法从API响应中提取下载链接');
    }

    console.log('✅ 后台获取到下载链接');
    await taskManager.update(taskId, { status: 'processing', progress: 60 });

    // 下载音频文件
    console.log('📥 后台下载音频...');
    console.log('🔗 下载链接:', downloadUrl);
    
    const downloadStartTime = Date.now();
    const audioResponse = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    const downloadDuration = Date.now() - downloadStartTime;
    console.log(`📥 下载响应状态: ${audioResponse.status}, 用时: ${downloadDuration}ms`);

    if (!audioResponse.ok) {
      throw new Error(`下载失败: ${audioResponse.status}`);
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    console.log(`✅ 后台音频下载完成，大小: ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    await taskManager.update(taskId, { status: 'processing', progress: 90 });

    // 完成任务
    const file_url = `/api/download/${taskId}`;
    urlCache.set(cacheKey, { file_url, created_at: Date.now() });

    await taskManager.update(taskId, {
      status: 'finished',
      file_url,
      progress: 100,
      audioBuffer: audioBuffer,
      title: 'YouTube Audio'
    });

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`🎉 后台处理完成! 用时: ${processingTime}秒`);

  } catch (error) {
    console.error('❌ 后台API处理失败:', error);
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    await taskManager.update(taskId, {
      status: 'error',
      error: `API处理失败: ${(error as Error).message}\n处理时间: ${processingTime}秒`
    });
  }
}

// 缓存清理函数
function cleanupExpiredCache() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, value] of urlCache.entries()) {
    if (now - value.created_at > CACHE_DURATION) {
      urlCache.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 清理了 ${cleanedCount} 个过期缓存项`);
  }
}