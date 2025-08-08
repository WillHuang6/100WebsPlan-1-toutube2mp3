import { NextRequest, NextResponse } from 'next/server';
import { taskManager } from '@/lib/tasks';

// 缓存
const urlCache = new Map<string, { file_url: string; created_at: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// 生成缓存键
function getCacheKey(url: string): string {
  return require('crypto').createHash('md5').update(url).digest('hex');
}

// 提取视频ID
function extractVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

// 后台任务处理API
export async function POST(req: NextRequest) {
  try {
    const { taskId, url } = await req.json();
    
    if (!taskId || !url) {
      return NextResponse.json({ error: 'Missing taskId or url' }, { status: 400 });
    }

    console.log('🔄 开始后台处理任务:', taskId);
    console.log('📋 目标URL:', url);

    // 立即返回，开始异步处理
    processTaskInBackground(taskId, url);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Background processing started',
      taskId 
    });

  } catch (error) {
    console.error('❌ 后台处理启动失败:', error);
    return NextResponse.json({ 
      error: 'Failed to start background processing',
      details: (error as Error).message 
    }, { status: 500 });
  }
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
      await processWithYtDlpBackground(taskId, url, videoId, cacheKey, startTime);
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
    
    // 不设置超时限制，让它慢慢处理
    const apiUrl = `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
      // 注意：这里没有signal: controller.signal，让它自然完成
    });

    console.log('📡 后台API响应状态:', response.status);

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
    
    const audioResponse = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

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

// 本地yt-dlp处理（保持原有逻辑）
async function processWithYtDlpBackground(taskId: string, url: string, videoId: string, cacheKey: string, startTime: number) {
  // 这里可以保持原来的yt-dlp逻辑，因为本地没有30秒限制
  await taskManager.update(taskId, {
    status: 'error',
    error: '本地yt-dlp处理暂未在异步架构中实现'
  });
}