import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// 简单内存缓存，避免Redis复杂性 - 使用全局对象在模块间共享
const globalThis = global as any;
if (!globalThis.simpleCache) {
  globalThis.simpleCache = new Map<string, { 
    audioBuffer: Buffer; 
    title: string; 
    createdAt: number; 
  }>();
}
const simpleCache = globalThis.simpleCache;

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时

// 验证YouTube URL
function isValidYouTubeUrl(url: string): boolean {
  const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
  return youtubeRegex.test(url);
}

// 提取视频ID
function extractVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

// 生成缓存键
function getCacheKey(url: string): string {
  return require('crypto').createHash('md5').update(url).digest('hex');
}

// 清理过期缓存
function cleanupCache() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, value] of simpleCache.entries()) {
    if (now - value.createdAt > CACHE_DURATION) {
      simpleCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 清理了 ${cleaned} 个过期缓存`);
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { url } = await req.json();
    
    if (!isValidYouTubeUrl(url)) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }
    
    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: 'Cannot extract video ID' }, { status: 400 });
    }
    
    console.log('🎯 开始简单转换:', videoId);
    
    // 检查缓存
    const cacheKey = getCacheKey(url);
    const cached = simpleCache.get(cacheKey);
    
    if (cached && Date.now() - cached.createdAt < CACHE_DURATION) {
      console.log('🚀 缓存命中');
      const taskId = uuidv4();
      
      // 临时存储用于下载
      simpleCache.set(taskId, cached);
      
      return NextResponse.json({
        task_id: taskId,
        status: 'finished',
        file_url: `/api/download-simple/${taskId}`,
        title: cached.title,
        message: '从缓存获取'
      });
    }
    
    // 检查API Key
    if (!process.env.RAPIDAPI_KEY) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }
    
    // 1. 调用RapidAPI
    console.log('📡 调用RapidAPI...');
    const apiStartTime = Date.now();
    
    const response = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const apiDuration = Date.now() - apiStartTime;
    console.log(`📡 API响应: ${response.status}, 用时: ${apiDuration}ms`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('📋 API数据:', { status: data.status, title: data.title });
    
    // 2. 获取下载链接
    const downloadUrl = data.link || data.url || data.download_url;
    if (!downloadUrl) {
      throw new Error('No download URL in API response');
    }
    
    // 3. 下载音频
    console.log('📥 下载音频...');
    const downloadStartTime = Date.now();
    
    const audioResponse = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    if (!audioResponse.ok) {
      throw new Error(`Download failed: ${audioResponse.status}`);
    }
    
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const downloadDuration = Date.now() - downloadStartTime;
    
    console.log(`📥 下载完成: ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB, 用时: ${downloadDuration}ms`);
    
    // 4. 存储到缓存
    const title = data.title || 'YouTube Audio';
    const taskId = uuidv4();
    
    simpleCache.set(cacheKey, {
      audioBuffer,
      title,
      createdAt: Date.now()
    });
    
    // 临时存储用于下载
    simpleCache.set(taskId, {
      audioBuffer,
      title,
      createdAt: Date.now()
    });
    
    // 清理过期缓存
    cleanupCache();
    
    const totalTime = Date.now() - startTime;
    console.log(`🎉 转换完成! 总用时: ${totalTime}ms`);
    
    return NextResponse.json({
      task_id: taskId,
      status: 'finished',
      file_url: `/api/download-simple/${taskId}`,
      title: title,
      message: '转换成功!',
      processing_time: `${totalTime}ms`
    });
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('❌ 转换失败:', error);
    
    return NextResponse.json({
      error: 'Conversion failed',
      details: (error as Error).message,
      processing_time: `${totalTime}ms`
    }, { status: 500 });
  }
}