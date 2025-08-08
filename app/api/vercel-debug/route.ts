import { NextRequest, NextResponse } from 'next/server';
import { taskManager } from '@/lib/tasks';

export async function GET(req: NextRequest) {
  const debugInfo: any = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      vercel: process.env.VERCEL,
      vercelEnv: process.env.VERCEL_ENV,
      vercelUrl: process.env.VERCEL_URL,
    },
    environmentVariables: {
      redisUrl: !!process.env.REDIS_URL,
      rapidApiKey: !!process.env.RAPIDAPI_KEY,
      redisUrlPrefix: process.env.REDIS_URL ? process.env.REDIS_URL.substring(0, 20) + '...' : 'N/A',
    },
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
  };

  // 测试Redis连接
  try {
    const testTaskId = 'test-' + Date.now();
    await taskManager.create(testTaskId, { status: 'test' });
    const retrievedTask = await taskManager.get(testTaskId);
    await taskManager.delete(testTaskId);
    
    debugInfo['redisTest'] = {
      success: true,
      taskCreated: !!retrievedTask,
      taskStatus: retrievedTask?.status
    };
  } catch (error) {
    debugInfo['redisTest'] = {
      success: false,
      error: (error as Error).message
    };
  }

  // 测试API连接
  try {
    const testResponse = await fetch('https://httpbin.org/get', {
      method: 'GET',
      headers: { 'User-Agent': 'Vercel-Test' }
    });
    
    debugInfo['networkTest'] = {
      success: testResponse.ok,
      status: testResponse.status,
      canMakeHttpRequests: true
    };
  } catch (error) {
    debugInfo['networkTest'] = {
      success: false,
      error: (error as Error).message,
      canMakeHttpRequests: false
    };
  }

  return NextResponse.json(debugInfo, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}