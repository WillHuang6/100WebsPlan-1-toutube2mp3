import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { taskManager } from '@/lib/tasks';
import crypto from 'crypto';

// 缓存
const urlCache = new Map<string, { file_url: string; created_at: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// 生成缓存键
function getCacheKey(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex');
}

// 验证YouTube URL
function isValidYouTubeUrl(url: string): boolean {
  const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
  return youtubeRegex.test(url);
}

// 主要转换函数 - 新架构：立即返回，后台处理
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { url, format } = await req.json();
    
    if (!isValidYouTubeUrl(url)) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }
    
    // 检查缓存
    const cacheKey = getCacheKey(url);
    const cached = urlCache.get(cacheKey);
    if (cached && Date.now() - cached.created_at < CACHE_DURATION) {
      const cachedTaskId = uuidv4();
      await taskManager.create(cachedTaskId, { 
        status: 'finished', 
        file_url: cached.file_url, 
        progress: 100 
      });
      console.log('🚀 缓存命中:', url);
      return NextResponse.json({ 
        task_id: cachedTaskId, 
        status: 'finished',
        message: '从缓存获取结果' 
      });
    }
    
    // 创建新任务
    const task_id = uuidv4();
    await taskManager.create(task_id, { 
      status: 'queued', 
      progress: 0,
      url: url,
      created_at: Date.now() 
    });

    console.log('🚀 任务创建:', task_id);
    console.log('📋 目标URL:', url);
    
    // 立即触发后台处理，不等待结果
    console.log('⚡ 触发后台处理...');
    
    try {
      // 调用后台处理API，不等待响应
      const processUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      console.log('🌐 后台处理URL:', `${processUrl}/api/process-task`);
      console.log('📋 发送数据:', JSON.stringify({ taskId: task_id, url }));
      
      fetch(`${processUrl}/api/process-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task_id, url })
      }).then(response => {
        console.log('✅ 后台处理触发响应:', response.status);
        if (!response.ok) {
          console.error('❌ 后台处理响应异常:', response.statusText);
        }
      }).catch(error => {
        console.error('❌ 后台处理触发失败:', error);
        // 如果后台处理触发失败，更新任务状态
        taskManager.update(task_id, {
          status: 'error',
          error: '无法启动后台处理，请稍后重试'
        }).catch(console.error);
      });
      
      console.log('✅ 后台处理已触发');
      
    } catch (error) {
      console.error('❌ 触发后台处理失败:', error);
      await taskManager.update(task_id, {
        status: 'error',
        error: '无法启动处理任务，请稍后重试'
      });
      return NextResponse.json({ 
        error: 'Failed to start processing',
        task_id 
      }, { status: 500 });
    }
    
    // 定期清理过期缓存
    cleanupExpiredCache();
    
    const responseTime = Date.now() - startTime;
    console.log(`⚡ API响应时间: ${responseTime}ms`);
    
    // 立即返回任务ID和状态，不等待处理完成
    return NextResponse.json({ 
      task_id, 
      status: 'queued',
      message: '任务已创建，正在后台处理...',
      estimated_time: '通常需要1-5分钟'
    });
    
  } catch (error) {
    console.error('💥 convert API 错误:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: (error as Error).message 
    }, { status: 500 });
  }
}

// 缓存清理函数
function cleanupExpiredCache() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, value] of urlCache.entries()) {
    if (now - value.created_at > CACHE_DURATION) {
      urlCache.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 清理了 ${cleanedCount} 个过期缓存项`);
  }
}