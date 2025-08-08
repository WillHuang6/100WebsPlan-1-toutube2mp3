import { NextRequest, NextResponse } from 'next/server';
import { taskManager } from '@/lib/tasks';

// 重试卡住的任务
export async function POST(req: NextRequest) {
  try {
    const { taskId } = await req.json();
    
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    console.log('🔄 重试任务:', taskId);
    
    // 获取任务信息
    const task = await taskManager.get(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    console.log('📋 任务信息:', task);
    
    if (task.status !== 'queued' && task.status !== 'processing') {
      return NextResponse.json({ 
        message: 'Task is not in retryable state',
        currentStatus: task.status 
      });
    }
    
    // 重置任务状态
    await taskManager.update(taskId, {
      status: 'queued',
      progress: 0
    });
    
    // 重新触发后台处理
    const processUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    console.log('🌐 重新触发后台处理:', `${processUrl}/api/process-task`);
    
    const response = await fetch(`${processUrl}/api/process-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, url: task.url })
    });
    
    console.log('✅ 后台处理重新触发响应:', response.status);
    
    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'Task retry initiated',
        taskId
      });
    } else {
      const errorText = await response.text();
      console.error('❌ 后台处理重新触发失败:', errorText);
      
      return NextResponse.json({
        error: 'Failed to retry task',
        details: errorText
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('❌ 重试任务失败:', error);
    return NextResponse.json({ 
      error: 'Failed to retry task',
      details: (error as Error).message 
    }, { status: 500 });
  }
}