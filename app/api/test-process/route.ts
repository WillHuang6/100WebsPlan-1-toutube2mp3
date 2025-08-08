import { NextResponse } from 'next/server';

// 测试process-task API是否可以被外部调用
export async function GET() {
  const testStartTime = Date.now();
  
  try {
    console.log('🧪 开始process-task API测试...');
    
    const testTaskId = 'test-task-' + Date.now();
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    
    console.log('📡 调用process-task API...');
    const response = await fetch('https://ytb2mp3.site/api/process-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: testTaskId, url: testUrl })
    });
    
    const responseTime = Date.now() - testStartTime;
    console.log(`📡 process-task API响应: ${response.status}, 用时: ${responseTime}ms`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ process-task API响应数据:', data);
      
      return NextResponse.json({
        success: true,
        status: response.status,
        data: data,
        responseTime: `${responseTime}ms`
      });
    } else {
      const errorText = await response.text();
      console.error('❌ process-task API失败:', errorText);
      
      return NextResponse.json({
        error: 'process-task API call failed',
        status: response.status,
        response: errorText,
        responseTime: `${responseTime}ms`
      }, { status: 500 });
    }
    
  } catch (error) {
    const responseTime = Date.now() - testStartTime;
    console.error('💥 测试process-task API失败:', error);
    
    return NextResponse.json({
      error: 'Test failed',
      details: (error as Error).message,
      name: (error as Error).name,
      responseTime: `${responseTime}ms`
    }, { status: 500 });
  }
}