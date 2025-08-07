import { NextRequest, NextResponse } from 'next/server';
import { tasks } from '@/lib/tasks';
import fs from 'fs';
import path from 'path';
import os from 'os';

// 专门用于音频流播放的轻量级端点
export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  
  // 快速检查任务状态（避免不必要的文件系统操作）
  const task = tasks.get(taskId);
  if (!task || task.status !== 'finished') {
    return new NextResponse('Not Found', { status: 404 });
  }
  
  const tempDir = os.tmpdir();
  const filePath = path.join(tempDir, `${taskId}.mp3`);
  
  // 快速存在性检查
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const lastModified = stats.mtime.toUTCString();
    
    // 检查If-None-Match/If-Modified-Since头（304缓存）
    const ifModifiedSince = req.headers.get('if-modified-since');
    const ifNoneMatch = req.headers.get('if-none-match');
    const etag = `"${stats.mtime.getTime()}-${fileSize}"`;
    
    if (ifNoneMatch === etag || ifModifiedSince === lastModified) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Last-Modified': lastModified,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
    
    // 流式响应
    const stream = fs.createReadStream(filePath);
    
    return new NextResponse(stream as any, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': fileSize.toString(),
        'Accept-Ranges': 'bytes',
        'ETag': etag,
        'Last-Modified': lastModified,
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      },
    });
    
  } catch (error) {
    return new NextResponse('File not found', { status: 404 });
  }
}
