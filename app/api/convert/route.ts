import { NextRequest, NextResponse } from 'next/server';

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
    
    // 4. 直接返回音频数据，避免Redis存储
    const title = data.title || 'YouTube Audio';
    console.log('🚀 使用直接下载模式，跳过Redis存储');
    
    // 设置安全的文件名
    const safeTitle = title
      .replace(/[^\w\s-]/g, '') 
      .replace(/\s+/g, '_') 
      .substring(0, 50) 
      .trim();
    
    const fileName = `${safeTitle || 'youtube_audio'}.mp3`;
    
    // 直接返回音频流
    const totalTime = Date.now() - startTime;
    console.log(`🎉 直接下载完成! 总用时: ${totalTime}ms`);
    
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Processing-Time': `${totalTime}ms`,
        'X-File-Title': encodeURIComponent(title)
      }
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