import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const results: any = {
    timestamp: new Date().toISOString(),
    environment: {
      platform: process.platform,
      nodeVersion: process.version,
      vercel: process.env.VERCEL,
    },
    tests: {}
  };

  // 测试1: 基本的HTTP连通性
  try {
    const start = Date.now();
    const response = await fetch('https://httpbin.org/get', {
      method: 'GET',
      headers: { 'User-Agent': 'Vercel-Test' }
    });
    const time = Date.now() - start;
    
    results.tests.httpbin = {
      success: response.ok,
      status: response.status,
      responseTime: `${time}ms`,
      data: await response.json()
    };
  } catch (error) {
    results.tests.httpbin = {
      success: false,
      error: (error as Error).message
    };
  }

  // 测试2: RapidAPI域名连通性
  try {
    const start = Date.now();
    const response = await fetch('https://youtube-mp36.p.rapidapi.com/', {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || 'test-key',
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const time = Date.now() - start;
    
    results.tests.rapidapi_connection = {
      success: response.ok,
      status: response.status,
      responseTime: `${time}ms`,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    results.tests.rapidapi_connection = {
      success: false,
      error: (error as Error).message
    };
  }

  // 测试3: 实际的API端点（用户的视频）
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    const start = Date.now();
    const response = await fetch('https://youtube-mp36.p.rapidapi.com/dl?id=nR5MvP9WFS0', {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || 'test-key',
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    const time = Date.now() - start;
    
    const responseText = await response.text();
    
    results.tests.rapidapi_endpoint = {
      success: response.ok,
      status: response.status,
      responseTime: `${time}ms`,
      headers: Object.fromEntries(response.headers.entries()),
      bodyPreview: responseText.substring(0, 200) + '...'
    };
  } catch (error) {
    results.tests.rapidapi_endpoint = {
      success: false,
      error: (error as Error).message,
      errorType: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'other'
    };
  }

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-cache' }
  });
}