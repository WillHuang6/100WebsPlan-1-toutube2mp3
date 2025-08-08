import { NextResponse } from 'next/server';

export async function GET() {
  const testStartTime = Date.now();
  
  try {
    console.log('🧪 开始RapidAPI测试...');
    
    if (!process.env.RAPIDAPI_KEY) {
      return NextResponse.json({ error: 'RAPIDAPI_KEY not configured' }, { status: 500 });
    }

    const testVideoId = 'dQw4w9WgXcQ'; // 使用较短的测试视频
    const apiUrl = `https://youtube-mp36.p.rapidapi.com/dl?id=${testVideoId}`;

    console.log('🌐 测试URL:', apiUrl);
    console.log('🔑 API Key存在:', !!process.env.RAPIDAPI_KEY);
    console.log('🔍 API Key前缀:', process.env.RAPIDAPI_KEY?.substring(0, 8));

    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

    try {
      const fetchStartTime = Date.now();
      console.log('📡 发起RapidAPI请求...');
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const fetchDuration = Date.now() - fetchStartTime;
      console.log(`📡 RapidAPI响应状态: ${response.status}, 用时: ${fetchDuration}ms`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('❌ RapidAPI错误响应:', errorText);
        return NextResponse.json({
          error: 'RapidAPI call failed',
          status: response.status,
          response: errorText,
          fetchDuration: `${fetchDuration}ms`,
          totalDuration: `${Date.now() - testStartTime}ms`
        }, { status: 500 });
      }

      const data = await response.json();
      console.log('✅ RapidAPI成功响应:', JSON.stringify(data, null, 2));

      return NextResponse.json({
        success: true,
        status: response.status,
        data: data,
        fetchDuration: `${fetchDuration}ms`,
        totalDuration: `${Date.now() - testStartTime}ms`
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.log('⏱️ RapidAPI请求超时 (60秒)');
        return NextResponse.json({
          error: 'Request timeout after 60 seconds',
          details: 'RapidAPI call was aborted due to timeout'
        }, { status: 408 });
      }
      
      throw fetchError;
    }

  } catch (error) {
    const totalDuration = Date.now() - testStartTime;
    console.error('💥 RapidAPI测试失败:', error);
    return NextResponse.json({
      error: 'Test failed',
      details: (error as Error).message,
      name: (error as Error).name,
      totalDuration: `${totalDuration}ms`
    }, { status: 500 });
  }
}