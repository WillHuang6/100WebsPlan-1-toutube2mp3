import { NextRequest, NextResponse } from 'next/server';
import { taskManager } from '@/lib/tasks';

// 专门用于音频流播放的端点
export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  
  console.log('🎵 请求音频流:', taskId);
  
  // 检查任务状态
  const task = await taskManager.get(taskId);
  if (!task || task.status !== 'finished') {
    console.log('❌ 任务未完成或不存在:', task?.status);
    return new NextResponse('Audio not ready', { status: 404 });
  }
  
  // 环境检测
  const isVercel = process.env.VERCEL === '1';
  
  if (isVercel) {
    // Vercel 环境：使用音频流
    if (!task.audioStream) {
      console.log('❌ Vercel 环境音频流不存在');
      return new NextResponse('Audio stream not found', { status: 404 });
    }
    
    try {
      console.log('✅ 返回 Vercel 音频流');
      return new NextResponse(task.audioStream as any, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
        },
      });
    } catch (error) {
      console.error('❌ 返回音频流失败:', error);
      return new NextResponse('Failed to stream audio', { status: 500 });
    }
  } else {
    // 本地环境：使用音频缓冲区
    if (!task.audioBuffer) {
      console.log('❌ 本地环境音频缓冲区不存在');
      return new NextResponse('Audio buffer not found', { status: 404 });
    }
    
    try {
      const buffer = task.audioBuffer;
      console.log(`✅ 返回音频缓冲区，大小: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
      
      // 处理 Range 请求 (支持音频播放器的跳转)
      const range = req.headers.get('range');
      
      if (range) {
        console.log('📊 处理 Range 请求:', range);
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1;
        const chunkSize = (end - start) + 1;
        
        const chunk = buffer.subarray(start, end + 1);
        
        return new NextResponse(chunk, {
          status: 206, // Partial Content
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize.toString(),
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
          },
        });
      } else {
        // 完整文件响应
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.length.toString(),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
          },
        });
      }
    } catch (error) {
      console.error('❌ 返回音频缓冲区失败:', error);
      return new NextResponse('Failed to return audio', { status: 500 });
    }
  }
}