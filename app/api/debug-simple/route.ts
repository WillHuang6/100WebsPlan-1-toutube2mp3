import { NextResponse } from 'next/server';

// 最简化的转换测试 - 不涉及Redis，不涉及复杂逻辑
export async function GET() {
  const testStartTime = Date.now();
  
  try {
    console.log('🧪 开始最简化转换测试...');
    
    // 使用我们之前测试成功的短视频
    const videoId = 'dQw4w9WgXcQ';
    
    console.log('1️⃣ 检查API Key...');
    if (!process.env.RAPIDAPI_KEY) {
      return NextResponse.json({ error: 'API Key not configured' });
    }
    console.log('✅ API Key存在');
    
    console.log('2️⃣ 调用RapidAPI...');
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
    console.log(`✅ RapidAPI响应: ${response.status}, 用时: ${apiDuration}ms`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ API错误:', errorText);
      return NextResponse.json({ error: 'API failed', details: errorText });
    }
    
    const data = await response.json();
    console.log('3️⃣ 解析API响应...');
    console.log('📋 响应数据:', {
      status: data.status,
      title: data.title,
      hasLink: !!data.link,
      progress: data.progress
    });
    
    // 获取下载链接
    const downloadUrl = data.link || data.url || data.download_url;
    if (!downloadUrl) {
      return NextResponse.json({ error: 'No download URL found', data });
    }
    
    console.log('4️⃣ 测试下载链接...');
    const downloadStartTime = Date.now();
    
    // 只下载前1MB来测试
    const audioResponse = await fetch(downloadUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Range': 'bytes=0-1048576' // 只下载1MB
      }
    });
    
    const downloadDuration = Date.now() - downloadStartTime;
    console.log(`✅ 下载测试: ${audioResponse.status}, 用时: ${downloadDuration}ms`);
    
    const totalTime = Date.now() - testStartTime;
    console.log(`🎉 测试完成，总用时: ${totalTime}ms`);
    
    return NextResponse.json({
      success: true,
      steps: {
        apiCall: `${apiDuration}ms`,
        download: `${downloadDuration}ms`,
        total: `${totalTime}ms`
      },
      data: {
        title: data.title,
        downloadUrl: downloadUrl.substring(0, 100) + '...',
        status: data.status
      }
    });
    
  } catch (error) {
    const totalTime = Date.now() - testStartTime;
    console.error('💥 测试失败:', error);
    
    return NextResponse.json({
      error: 'Test failed',
      details: (error as Error).message,
      name: (error as Error).name,
      stack: (error as Error).stack?.split('\n').slice(0, 5),
      totalTime: `${totalTime}ms`
    });
  }
}