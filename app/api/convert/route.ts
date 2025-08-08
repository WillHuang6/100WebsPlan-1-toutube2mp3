import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

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
    
    console.log('🎯 开始转换:', videoId);
    
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
    console.log('📋 API数据:', { 
      status: data.status, 
      title: data.title, 
      progress: data.progress,
      hasLink: !!data.link,
      hasUrl: !!data.url,
      hasDownloadUrl: !!data.download_url
    });
    
    // 2. 获取下载链接
    const downloadUrl = data.link || data.url || data.download_url;
    if (!downloadUrl) {
      console.log('❌ 完整API响应:', JSON.stringify(data, null, 2));
      throw new Error('No download URL in API response');
    }
    
    // 3. 下载音频
    console.log('📥 下载音频...');
    console.log('🔗 下载链接:', downloadUrl);
    const downloadStartTime = Date.now();
    
    const audioResponse = await fetch(downloadUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://youtube-mp36.p.rapidapi.com/',
        'Accept': 'audio/mpeg, audio/*'
      }
    });
    
    console.log('📥 下载响应状态:', audioResponse.status);
    
    if (!audioResponse.ok) {
      const errorText = await audioResponse.text();
      console.log('❌ 下载错误详情:', errorText);
      throw new Error(`Download failed: ${audioResponse.status} - ${errorText.substring(0, 200)}`);
    }
    
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const downloadDuration = Date.now() - downloadStartTime;
    
    console.log(`📥 下载完成: ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB, 用时: ${downloadDuration}ms`);
    
    // 4. 存储到Redis with memory optimization
    const title = data.title || 'YouTube Audio';
    const taskId = uuidv4();
    
    console.log('💾 存储到Redis...');
    const { getRedisClient } = await import('@/lib/kv');
    const redis = await getRedisClient();
    
    // 激进的内存清理策略 - 先清理再存储
    try {
      const audioKeys = await redis.keys('audio:*');
      console.log(`🔍 找到 ${audioKeys.length} 个现有音频文件`);
      
      // 如果音频文件过多，清理最旧的文件
      if (audioKeys.length >= 3) {
        console.log('⚠️ 音频文件过多，执行激进清理');
        
        // 获取所有相关的键（包括title键）
        const titleKeys = audioKeys.map(key => key.replace('audio:', 'title:'));
        const allKeysToDelete = [...audioKeys, ...titleKeys];
        
        if (allKeysToDelete.length > 0) {
          const deleteResult = await redis.del(allKeysToDelete);
          console.log(`🧹 激进清理: 删除了所有 ${Math.floor(deleteResult / 2)} 个音频文件`);
        }
      } else {
        // 正常清理逻辑 - 只清理即将过期的
        const expiredKeys = [];
        
        for (const key of audioKeys) {
          const ttl = await redis.ttl(key);
          if (ttl < 0 || ttl < 1800) { // 删除已过期或30分钟内过期的
            expiredKeys.push(key, key.replace('audio:', 'title:'));
          }
        }
        
        if (expiredKeys.length > 0) {
          const deleteResult = await redis.del(expiredKeys);
          console.log(`🧹 常规清理: 删除了 ${Math.floor(deleteResult / 2)} 个过期音频文件`);
        }
      }
      
      // 等待一下确保删除操作完成
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (cleanupError) {
      console.warn('清理过期文件时出错:', cleanupError);
      
      // 如果清理出错，尝试删除所有音频文件
      try {
        const allAudioKeys = await redis.keys('audio:*');
        const allTitleKeys = await redis.keys('title:*');
        const emergencyKeys = [...allAudioKeys, ...allTitleKeys];
        
        if (emergencyKeys.length > 0) {
          await redis.del(emergencyKeys);
          console.log(`🚨 紧急清理: 删除了所有 ${Math.floor(emergencyKeys.length / 2)} 个文件`);
        }
      } catch (emergencyError) {
        console.error('紧急清理也失败了:', emergencyError);
      }
    }
    
    // 存储音频数据到Redis (缩短过期时间到1小时)
    try {
      const audioBase64 = audioBuffer.toString('base64');
      console.log(`💾 准备存储: ${(audioBase64.length / 1024 / 1024).toFixed(2)}MB (base64)`);
      
      await redis.setEx(`audio:${taskId}`, 3600, audioBase64); // 1小时 = 3600秒
      await redis.setEx(`title:${taskId}`, 3600, title);
      
      console.log('💾 Redis存储成功');
      
    } catch (redisError) {
      console.error('❌ Redis存储失败:', redisError);
      
      // 如果存储失败，再次尝试清理并重试
      try {
        console.log('🧹 尝试清理后重新存储...');
        const allKeys = await redis.keys('*');
        if (allKeys.length > 0) {
          await redis.del(allKeys);
          console.log(`🧹 删除了所有 ${allKeys.length} 个键`);
        }
        
        // 重试存储
        const audioBase64 = audioBuffer.toString('base64');
        await redis.setEx(`audio:${taskId}`, 3600, audioBase64);
        await redis.setEx(`title:${taskId}`, 3600, title);
        
        console.log('💾 重试存储成功');
        
      } catch (retryError) {
        console.error('❌ 重试也失败:', retryError);
        throw new Error(`Redis storage failed: ${(redisError as Error).message}. Even after cleanup, retry failed: ${(retryError as Error).message}`);
      }
    }
    
    console.log('💾 存储完成:');
    console.log('  - 任务ID:', taskId);
    console.log('  - 音频大小:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
    console.log('  - 标题:', title);
    
    const totalTime = Date.now() - startTime;
    console.log(`🎉 转换完成! 总用时: ${totalTime}ms`);
    
    return NextResponse.json({
      task_id: taskId,
      status: 'finished',
      file_url: `/api/download/${taskId}`,
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